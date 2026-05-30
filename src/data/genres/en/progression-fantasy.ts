import { GenreProfile } from '@/types/genreProfile'

export const progressionFantasyProfile: GenreProfile = {
  id: 'en-progression-fantasy',
  name: 'Progression Fantasy',
  description: 'A fantasy subgenre where advancing in power, skill, or rank is a central focus of the narrative. Includes LitRPG, power progression, cultivation-adjacent systems, and class-based advancement.',

  writingRules: [
    'Power progression must feel earned through effort, sacrifice, or clever problem-solving — never handed out freely',
    'Each power-up or rank advancement must have narrative weight and emotional payoff',
    'The progression system (levels, ranks, tiers) must be internally consistent and clearly communicated to the reader',
    'Setbacks and plateaus are essential — unbroken progress becomes monotonous and tensionless',
    'The protagonist must face challenges calibrated to their current level, with periodic leaps that test new abilities',
    'Side characters should have their own progression arcs, even if less detailed than the protagonist\'s',
    'World-building must explain why the progression system exists and how it shapes society',
    'Combat scenes should showcase tactical use of abilities, not just raw power displays',
    'Information about the power system should be revealed gradually, maintaining mystery and discovery',
    'The cost of power (physical, moral, social) must be explored and felt by the protagonist',
    'Training arcs should be engaging and show character growth, not just stat increases',
    'Power scaling must avoid inflation — each tier should feel meaningfully stronger than the last',
    'Foreshadow higher tiers early to create aspirational tension for the reader',
  ],

  genreRules: [
    'Progression mechanics (levels, ranks, skills, stats) must be clearly defined with rules and limitations',
    'The protagonist starts at or near the bottom of the power hierarchy and must climb through demonstrated competence',
    'Each major arc should correspond to a meaningful tier or rank transition',
    'Power-ups gained in climactic moments must be foreshadowed or earned through preceding chapters',
    'The world must have an established hierarchy of power that characters navigate and contest',
    'Rare resources, mentors, or forbidden knowledge should drive plot tension around progression',
  ],

  prohibitions: [
    'Do NOT give the protagonist unexplained or convenient power boosts at critical moments (deus ex machina)',
    'Do NOT break the established rules of the power system for dramatic effect',
    'Do NOT introduce a power system and then ignore its mechanics when inconvenient',
    'Do NOT make every fight a stomp — the protagonist must struggle and sometimes lose',
    'Do NOT neglect the social consequences of rapid power growth (jealousy, fear, political attention)',
    'Do NOT use generic or unexplained training montages that skip over meaningful progression details',
    'Do NOT allow side characters to progress off-screen without any narrative justification',
  ],

  auditDimensions: [
    {
      id: 'system-consistency',
      name: 'Power System Consistency',
      severity: 'critical',
      weight: 10,
      checkInstruction: 'Verify that the power/rank system is internally consistent. Check that abilities, limitations, and progression requirements are not contradicted across chapters.',
    },
    {
      id: 'earned-progression',
      name: 'Earned Progression',
      severity: 'critical',
      weight: 9,
      checkInstruction: 'Verify that each power-up or advancement is earned through effort, training, or meaningful narrative events — not granted arbitrarily.',
    },
    {
      id: 'challenge-calibration',
      name: 'Challenge Calibration',
      severity: 'critical',
      weight: 8,
      checkInstruction: 'Check that antagonists and obstacles are appropriately scaled to the protagonist\'s current level, providing genuine tension without being impossible.',
    },
    {
      id: 'combat-tactics',
      name: 'Combat Tactical Depth',
      severity: 'warning',
      weight: 7,
      checkInstruction: 'Verify that combat scenes showcase tactical thinking and creative use of abilities rather than simple power comparisons.',
    },
    {
      id: 'world-hierarchy',
      name: 'World Power Hierarchy',
      severity: 'warning',
      weight: 7,
      checkInstruction: 'Check that the world\'s power hierarchy is clearly established and that characters\' positions within it are consistent and meaningful.',
    },
    {
      id: 'cost-of-power',
      name: 'Cost of Power',
      severity: 'warning',
      weight: 6,
      checkInstruction: 'Verify that gaining power has real costs (physical, moral, social) that affect the protagonist and drive character development.',
    },
    {
      id: 'side-character-progression',
      name: 'Side Character Progression',
      severity: 'info',
      weight: 5,
      checkInstruction: 'Check that supporting characters have their own growth arcs and are not frozen in place while the protagonist advances.',
    },
    {
      id: 'pacing-of-discovery',
      name: 'Pacing of Discovery',
      severity: 'info',
      weight: 5,
      checkInstruction: 'Verify that new information about the power system is revealed at a satisfying pace — not dumped all at once or withheld too long.',
    },
  ],

  pacingTemplate: [
    {
      phase: 'Awakening',
      description: 'The protagonist discovers the power system and their initial (usually low) standing within it. Establish the rules and the aspiration to grow.',
      wordCountRatio: 0.15,
      tensionLevel: 'low',
    },
    {
      phase: 'Foundation',
      description: 'The protagonist trains, experiments, and achieves the first meaningful rank-up. Early rivals and mentors are introduced.',
      wordCountRatio: 0.2,
      tensionLevel: 'medium',
    },
    {
      phase: 'Bottleneck',
      description: 'Progress stalls. The protagonist faces a wall that cannot be overcome with brute effort alone — requiring insight, sacrifice, or rare resources.',
      wordCountRatio: 0.15,
      tensionLevel: 'medium',
    },
    {
      phase: 'Breakthrough',
      description: 'A major advancement is achieved through a climactic event. New abilities are unlocked and the protagonist enters a wider arena of power.',
      wordCountRatio: 0.2,
      tensionLevel: 'high',
    },
    {
      phase: 'Escalation',
      description: 'Stronger enemies and higher stakes emerge. The protagonist must push beyond comfort zones and confront the true cost of power.',
      wordCountRatio: 0.2,
      tensionLevel: 'climax',
    },
    {
      phase: 'Ascension',
      description: 'The protagonist reaches a new peak, resolving the arc\'s central conflict while hinting at even greater heights yet to be climbed.',
      wordCountRatio: 0.1,
      tensionLevel: 'high',
    },
  ],

  characterTypes: [
    {
      type: 'The Underdog Protagonist',
      description: 'Starts at the bottom of the power hierarchy with hidden potential or a unique advantage that sets them on an unconventional path.',
      requiredTraits: ['determined', 'resourceful', 'adaptable', 'humble origin'],
      avoidTraits: ['instantly overpowered', 'passive', 'entitled', 'lacking agency'],
    },
    {
      type: 'The Mentor',
      description: 'An experienced figure who guides the protagonist through the early stages of progression, often with their own hidden scars.',
      requiredTraits: ['knowledgeable', 'patient', 'flawed', 'has a past'],
      avoidTraits: ['all-knowing', 'perfect', 'disposable', 'exposition dump'],
    },
    {
      type: 'The Rival',
      description: 'A peer who progresses alongside or ahead of the protagonist, creating competitive tension and benchmarking growth.',
      requiredTraits: ['talented', 'driven', 'complex motivation', 'respect-grudging'],
      avoidTraits: ['purely antagonistic', 'one-dimensional', 'always loses', 'no growth'],
    },
    {
      type: 'The Gatekeeper',
      description: 'A powerful figure at a higher tier who represents what the protagonist could become — or a threshold that must be overcome.',
      requiredTraits: ['imposing presence', 'embodies a philosophy', 'tests the protagonist', 'layered motivation'],
      avoidTraits: ['cartoonishly evil', 'easily defeated', 'no personality', 'exists only to block'],
    },
  ],

  styleConstraints: {
    tone: ['epic and aspirational', 'tension-driven', 'wonder at discovery', 'gritty during setbacks'],
    vocabulary: ['system terminology (ranks, tiers, skills)', 'tactical combat language', 'training and discipline vocabulary', 'world-specific jargon'],
    sentenceStyle: ['short punchy sentences during combat', 'detailed technical passages for power-ups', 'reflective passages during training', 'cliffhanger paragraph endings at rank transitions'],
    forbiddenWords: ['lol', 'omg', 'gonna', 'wanna', 'kinda', 'sorta', 'yeet', 'bruh'],
  },

  metadata: {
    version: '1.0.0',
    updatedAt: Date.now(),
  },
}
