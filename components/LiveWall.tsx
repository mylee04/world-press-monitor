'use client';

import { useEffect, useMemo, useState } from 'react';

interface LiveChannel {
  id: string;
  name: string;
  handle: string;
  fallbackVideoId: string;
}

const LIVE_CHANNELS: LiveChannel[] = [
  { id: 'bloomberg', name: 'Bloomberg', handle: '@Bloomberg', fallbackVideoId: 'iEpJwprxDdk' },
  { id: 'sky', name: 'Sky News', handle: '@SkyNews', fallbackVideoId: 'YDvsBbKfLPA' },
  { id: 'france24', name: 'France 24', handle: '@FRANCE24English', fallbackVideoId: 'Ap-UM1O9RBU' },
  { id: 'dw', name: 'DW', handle: '@DWNews', fallbackVideoId: 'LuKwFajn37U' },
  { id: 'cnbc', name: 'CNBC', handle: '@CNBC', fallbackVideoId: '9NyxcX3rhQs' },
  { id: 'aljazeera', name: 'Al Jazeera', handle: '@AlJazeeraEnglish', fallbackVideoId: 'gCNeDWCI0vo' },
  { id: 'euronews', name: 'Euronews', handle: '@euronews', fallbackVideoId: 'pykpO5kQJ98' }
];

const FIXED_MAJOR_CHANNELS = ['bloomberg', 'sky', 'france24', 'dw'];
const STORAGE_KEY = 'presslab.livewall.custom.v1';
const LIVE_CACHE_TTL_MS = 5 * 60 * 1000;

type LiveLookupResult = {
  videoId: string | null;
  isLive: boolean;
  checkedAt: string;
};

interface TileState {
  slot: number;
  channelId: string;
  videoId: string;
  isLive: boolean;
}

const liveCache = new Map<string, { videoId: string | null; isLive: boolean; timestamp: number }>();

function buildTiles(channelIds: string[]): TileState[] {
  return channelIds.map((channelId, slot) => ({
    slot,
    channelId,
    videoId: LIVE_CHANNELS.find((channel) => channel.id === channelId)?.fallbackVideoId || LIVE_CHANNELS[0].fallbackVideoId,
    isLive: false
  }));
}

async function resolveLiveVideo(channel: LiveChannel): Promise<LiveLookupResult> {
  const cached = liveCache.get(channel.handle);
  if (cached && Date.now() - cached.timestamp < LIVE_CACHE_TTL_MS) {
    return {
      videoId: cached.videoId ?? channel.fallbackVideoId,
      isLive: cached.isLive,
      checkedAt: new Date(cached.timestamp).toISOString()
    };
  }

  try {
    const res = await fetch(`/api/youtube/live?channel=${encodeURIComponent(channel.handle)}`);
    if (!res.ok) throw new Error('Failed to resolve live stream');
    const data = (await res.json()) as LiveLookupResult;
    liveCache.set(channel.handle, {
      videoId: data.videoId,
      isLive: Boolean(data.videoId && data.isLive),
      timestamp: Date.now()
    });
    return {
      videoId: data.videoId ?? channel.fallbackVideoId,
      isLive: Boolean(data.videoId && data.isLive),
      checkedAt: data.checkedAt || new Date().toISOString()
    };
  } catch {
    return {
      videoId: channel.fallbackVideoId,
      isLive: false,
      checkedAt: new Date().toISOString()
    };
  }
}

export function LiveWall() {
  const [mode, setMode] = useState<'major' | 'custom'>('major');
  const [tiles, setTiles] = useState<TileState[]>(buildTiles(FIXED_MAJOR_CHANNELS));
  const [updatedAt, setUpdatedAt] = useState<string>('');
  const [unmutedSlot, setUnmutedSlot] = useState<number | null>(null);

  const channelById = useMemo(() => new Map(LIVE_CHANNELS.map((channel) => [channel.id, channel])), []);

  const refreshTiles = async (currentTiles: TileState[]) => {
    const resolved = await Promise.all(
      currentTiles.map(async (tile) => {
        const channel = channelById.get(tile.channelId);
        if (!channel) return tile;
        const live = await resolveLiveVideo(channel);
        return {
          ...tile,
          videoId: live.videoId || channel.fallbackVideoId,
          isLive: live.isLive
        };
      })
    );
    setTiles(resolved);
    setUpdatedAt(new Date().toISOString());
  };

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as { channelIds?: string[] };
      const saved = parsed.channelIds || [];
      if (saved.length !== 4) return;
      const valid = saved.every((id) => channelById.has(id));
      if (!valid) return;
      if (mode === 'custom') {
        setTiles(buildTiles(saved));
      }
    } catch {
      // no-op
    }
  }, [channelById, mode]);

  useEffect(() => {
    const starter = mode === 'major' ? buildTiles(FIXED_MAJOR_CHANNELS) : tiles;
    void refreshTiles(starter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    const interval = setInterval(() => {
      setTiles((current) => {
        void refreshTiles(current);
        return current;
      });
    }, LIVE_CACHE_TTL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setTileChannel = (slot: number, nextChannelId: string) => {
    setTiles((current) => {
      const next = current.map((tile) => (
        tile.slot === slot ? { ...tile, channelId: nextChannelId } : tile
      ));
      void refreshTiles(next);
      return next;
    });
  };

  const switchMode = (nextMode: 'major' | 'custom') => {
    setMode(nextMode);
    if (nextMode === 'major') {
      const next = buildTiles(FIXED_MAJOR_CHANNELS);
      setTiles(next);
      setUnmutedSlot(null);
      void refreshTiles(next);
      return;
    }

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { channelIds?: string[] };
        if (parsed.channelIds?.length === 4 && parsed.channelIds.every((id) => channelById.has(id))) {
          const next = buildTiles(parsed.channelIds);
          setTiles(next);
          setUnmutedSlot(null);
          void refreshTiles(next);
          return;
        }
      }
    } catch {
      // no-op
    }

    const fallback = buildTiles(FIXED_MAJOR_CHANNELS);
    setTiles(fallback);
    void refreshTiles(fallback);
  };

  const saveCustom = () => {
    const payload = { channelIds: tiles.map((tile) => tile.channelId) };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    setMode('custom');
  };

  return (
    <section className="panel livewall-panel">
      <div className="livewall-header">
        <h2>Live TV Wall</h2>
        <code>4 channels · one audio only · default muted</code>
      </div>
      <div className="livewall-actions">
        <button
          type="button"
          className={mode === 'major' ? 'active' : ''}
          onClick={() => switchMode('major')}
        >
          Major Journal 4ch
        </button>
        <button
          type="button"
          className={mode === 'custom' ? 'active' : ''}
          onClick={() => switchMode('custom')}
        >
          Custom
        </button>
        <button type="button" onClick={saveCustom}>Save Custom Layout</button>
        <p className="meta">Last checked: {updatedAt ? new Date(updatedAt).toLocaleString() : 'Checking...'}</p>
      </div>

      <div className="livewall-grid">
        {tiles.map((tile) => {
          const channel = channelById.get(tile.channelId);
          if (!channel) return null;

          const isUnmuted = unmutedSlot === tile.slot;
          const src = `https://www.youtube.com/embed/${tile.videoId}?autoplay=1&mute=${isUnmuted ? 0 : 1}&playsinline=1&controls=1&rel=0`;

          return (
            <article key={`${tile.slot}-${tile.videoId}-${isUnmuted ? 'a1' : 'a0'}`} className="live-tile">
              <div className="live-tile-top">
                <select
                  value={tile.channelId}
                  disabled={mode === 'major'}
                  onChange={(event) => setTileChannel(tile.slot, event.target.value)}
                >
                  {LIVE_CHANNELS.map((item) => (
                    <option key={item.id} value={item.id}>{item.name}</option>
                  ))}
                </select>
                <span className={tile.isLive ? 'live-pill active' : 'live-pill fallback'}>
                  {tile.isLive ? 'LIVE' : 'Fallback'}
                </span>
                <button
                  type="button"
                  onClick={() => setUnmutedSlot((current) => (current === tile.slot ? null : tile.slot))}
                >
                  {isUnmuted ? 'Sound On' : 'Muted'}
                </button>
              </div>

              <div className="live-frame-wrap">
                <iframe
                  title={`live-${tile.slot}-${channel.name}`}
                  src={src}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                  loading="lazy"
                />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
