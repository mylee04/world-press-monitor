import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

function extractLiveVideoId(html: string): { videoId: string | null; isLive: boolean } {
  const liveMatch = /"isLive"\s*:\s*true|"isLiveNow"\s*:\s*true/i.test(html);
  const videoIdMatch = html.match(/"videoId"\s*:\s*"([a-zA-Z0-9_-]{11})"/);
  if (!liveMatch || !videoIdMatch) {
    return { videoId: null, isLive: false };
  }
  return { videoId: videoIdMatch[1], isLive: true };
}

export async function GET(request: NextRequest) {
  const channel = request.nextUrl.searchParams.get('channel');
  if (!channel) {
    return NextResponse.json({ error: 'Missing channel parameter' }, { status: 400 });
  }

  try {
    const handle = channel.startsWith('@') ? channel : `@${channel}`;
    const liveUrl = `https://www.youtube.com/${handle}/live`;
    const response = await fetch(liveUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
      },
      redirect: 'follow'
    });

    if (!response.ok) {
      return NextResponse.json(
        { channel: handle, videoId: null, isLive: false, checkedAt: new Date().toISOString() },
        { status: 200, headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
      );
    }

    const html = await response.text();
    const { videoId, isLive } = extractLiveVideoId(html);

    return NextResponse.json(
      { channel: handle, videoId, isLive, checkedAt: new Date().toISOString() },
      { status: 200, headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } }
    );
  } catch {
    return NextResponse.json(
      { channel, videoId: null, isLive: false, checkedAt: new Date().toISOString() },
      { status: 200, headers: { 'Cache-Control': 'public, s-maxage=180, stale-while-revalidate=300' } }
    );
  }
}
