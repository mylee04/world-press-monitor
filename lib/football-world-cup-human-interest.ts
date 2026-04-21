export type HumanInterestEditorialUse = 'live' | 'profile' | 'feature';

export type HumanInterestSourceTier =
  | 'official'
  | 'major_press'
  | 'self_disclosed'
  | 'documentary_or_profile'
  | 'wiki_hint'
  | 'community_hint'
  | 'blocked';

export type HumanInterestSensitivity = 'low' | 'medium' | 'high';

export type HumanInterestVerificationStatus = 'verified' | 'well_sourced' | 'reported' | 'hint_only';

export type HumanInterestReviewStatus = 'approved' | 'needs_review' | 'blocked';

export type HumanInterestResearchNoteType =
  | 'wiki_hint'
  | 'community_hint'
  | 'manual_follow_up'
  | 'blocked';

export type HumanInterestResearchSourceSystem =
  | 'wikipedia'
  | 'wikidata'
  | 'grokpedia'
  | 'namuwiki'
  | 'other';

export type HumanInterestResearchReviewPriority = 'high' | 'medium' | 'low';

export type HumanInterestClaimType =
  | 'career_origin'
  | 'lower_league_path'
  | 'academy_release'
  | 'late_breakthrough'
  | 'injury_comeback'
  | 'career_rebuild'
  | 'coach_trust_story'
  | 'selection_redemption'
  | 'family_influence'
  | 'background_hardship'
  | 'migration_identity'
  | 'education_or_dual_path'
  | 'community_symbol'
  | 'leadership_arc'
  | 'self_disclosed_personal_context'
  | 'public_family_context'
  | 'off_field_character';

export type HumanInterestClaimMetadata = {
  editorialUse: HumanInterestEditorialUse;
  angleType: HumanInterestClaimType;
  sourceTier: HumanInterestSourceTier;
  sensitivity: HumanInterestSensitivity;
  verificationStatus: HumanInterestVerificationStatus;
  featureScore: number;
  sourceStrength: number;
  sensitivityRisk: number;
  reviewStatus: HumanInterestReviewStatus;
  isSelfDisclosed?: boolean;
  isFamilyRelated?: boolean;
  isMinorRelated?: boolean;
  timeScope?: 'career' | 'tournament' | 'background' | 'recent';
  newsworthinessNow?: number;
  notes?: string;
};

export type HumanInterestEvidenceRef = {
  sourceTier: HumanInterestSourceTier;
  sourceLabel: string | null;
  sourceUrl: string | null;
  quoteAvailable: boolean;
  observedAt: string | null;
};

export type HumanInterestLiveHook = {
  hookType:
    | 'selection'
    | 'injury'
    | 'suspension'
    | 'captaincy'
    | 'coach_quote'
    | 'official_interview'
    | 'storyline_spike'
    | 'social_growth';
  headline: string;
  summary: string | null;
  newsworthinessNow: number;
  sourceStrength: number;
  freshnessDays: number | null;
  sourceTier: HumanInterestSourceTier;
  evidence: HumanInterestEvidenceRef[];
};

export type HumanInterestFeatureAngle = {
  claimType: HumanInterestClaimType;
  headline: string;
  summary: string | null;
  claimText: string;
  metadata: HumanInterestClaimMetadata;
  evidence: HumanInterestEvidenceRef[];
};

export type HumanInterestCareerArcStage = {
  stageOrder: number;
  label: string;
  startDate: string | null;
  endDate: string | null;
  summary: string | null;
  sourceTier: HumanInterestSourceTier;
  sourceUrl: string | null;
};

export type HumanInterestEditorialScores = {
  newsworthinessNow: number;
  featureDepthScore: number;
  sourceStrength: number;
  sensitivityRisk: number;
  overallPriority: number;
};

export type HumanInterestPersonIdentity = {
  sportsPersonId: string | null;
  canonicalName: string;
  displayName: string | null;
  teamCanonicalName: string;
  personRoleType: string;
  positionGroup: string | null;
  currentClub: string | null;
  birthDate: string | null;
  primaryNationality: string | null;
};

export type FootballWorldCupEditorialPersonCard = {
  identity: HumanInterestPersonIdentity;
  liveHooks: HumanInterestLiveHook[];
  featureAngles: HumanInterestFeatureAngle[];
  careerArc: HumanInterestCareerArcStage[];
  publicPersonalContext: HumanInterestFeatureAngle[];
  editorialScores: HumanInterestEditorialScores;
};

export type HumanInterestPilotRecord = {
  teamCanonicalName: string;
  personCanonicalName: string;
  personRoleType: string;
  priorityTier: 'top20' | 'top50' | 'watchlist';
  editorialPriorityReason: string;
  identityHints?: {
    positionGroup?: string | null;
    currentClub?: string | null;
  };
  liveHooks: Array<{
    hookType: HumanInterestLiveHook['hookType'];
    headline: string;
    summary: string | null;
    sourceTier: HumanInterestSourceTier;
    sourceLabel: string | null;
    sourceUrl: string | null;
    observedAt: string | null;
  }>;
  featureAngles: Array<{
    claimType: HumanInterestClaimType;
    headline: string;
    summary: string | null;
    claimText: string;
    sourceTier: HumanInterestSourceTier;
    sourceLabel: string | null;
    sourceUrl: string | null;
    sensitivity: HumanInterestSensitivity;
    verificationStatus: HumanInterestVerificationStatus;
    featureScore: number;
    sourceStrength: number;
    sensitivityRisk: number;
    reviewStatus: HumanInterestReviewStatus;
    notes?: string;
  }>;
  careerArc: HumanInterestCareerArcStage[];
  publicPersonalContext: Array<{
    claimType: HumanInterestClaimType;
    headline: string;
    summary: string | null;
    sourceTier: HumanInterestSourceTier;
    sourceLabel: string | null;
    sourceUrl: string | null;
    sensitivity: HumanInterestSensitivity;
    reviewStatus: HumanInterestReviewStatus;
  }>;
  researchNotes: HumanInterestPilotResearchNote[];
};

export type HumanInterestPilotResearchNote = {
  noteType: HumanInterestResearchNoteType;
  sourceSystem?: HumanInterestResearchSourceSystem;
  sourceTier?: Extract<HumanInterestSourceTier, 'wiki_hint' | 'community_hint' | 'blocked'>;
  sourceLabel?: string | null;
  hintedClaimTypes?: HumanInterestClaimType[];
  reviewPriority?: HumanInterestResearchReviewPriority;
  text: string;
  evidenceUrl: string | null;
  notes?: string;
};

export type HumanInterestResearchHint = {
  noteType: HumanInterestResearchNoteType;
  sourceSystem: HumanInterestResearchSourceSystem;
  sourceTier: Extract<HumanInterestSourceTier, 'wiki_hint' | 'community_hint' | 'blocked'>;
  sourceLabel: string | null;
  sourceUrl: string | null;
  hintedClaimTypes: HumanInterestClaimType[];
  summary: string;
  reviewPriority: HumanInterestResearchReviewPriority;
  notes?: string;
};

export type HumanInterestResearchHintRecord = {
  teamCanonicalName: string;
  personCanonicalName: string;
  personRoleType: string;
  hints: HumanInterestResearchHint[];
};
