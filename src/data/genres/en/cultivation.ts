import { GenreProfile } from '@/types/genreProfile'

export const cultivationProfile: GenreProfile = {
  id: 'en-cultivation',
  name: 'Cultivation',
  description: 'An English-language xianxia-inspired genre focused on spiritual cultivation, martial arts, and transcending mortal limitations through defined stages of power. Draws from Daoist and Buddhist philosophical traditions adapted for Western readership.',

  writingRules: [
    'Cultivation stages (Qi Condensation, Foundation Establishment, Core Formation, etc.) must be clearly defined with named thresholds',
    'Each breakthrough must involve both physical/spiritual transformation and philosophical insight',
    'The Dao or Path chosen by the cultivator must influence their abilities, personality, and narrative arc',
    'Martial arts techniques must be described with sensory detail — qi flow, body mechanics, spiritual resonance',
    'Sect politics and hierarchical dynamics must feel authentic, with real consequences for transgressions',
    'Tribulations (heavenly trials) must be genuinely dangerous and narratively meaningful',
    'The lifespan disparity between cultivation stages must affect relationships and world perspectives',
    'Spiritual bottlenecks should require character growth, not just more resources or harder training',
    'Alchemy, formation arrays, and artifact refining should follow consistent internal rules',
    'The relationship between mortal society and the cultivation world must be explored',
    'Internal monologue during cultivation should blend physical sensation with philosophical reflection',
    'Face culture and reputation dynamics must drive social conflict meaningfully',
    'Rare spiritual resources should be genuine plot drivers, not generic loot drops',
    'Dual cultivation or companion beasts must follow established power system rules',
  ],

  genreRules: [
    'Cultivation stages must have clearly named ranks with observable differences in power and perception',
    'Breakthroughs must be earned through a combination of resources, insight, and perseverance — never instantaneous',
    'Heavenly tribulations must occur at major stage transitions and pose genuine mortal danger',
    'Sect hierarchies must be respected — seniority, strength, and backing all matter in social interactions',
    'The protagonist\'s Dao (philosophical path) must be thematically consistent and influence their combat style and decisions',
    'Qi, meridians, dantian, and spiritual sense must operate under consistent rules throughout the narrative',
    'Realm suppression (higher cultivators being overwhelmingly stronger than lower ones) must be maintained except for rare, justified exceptions',
  ],

  prohibitions: [
    'Do NOT allow the protagonist to skip cultivation stages without severe consequences or narrative justification',
    'Do NOT treat qi or spiritual energy as an infinite resource without recovery costs',
    'Do NOT have characters explain cultivation basics they would already know in conversation (As-You-Know-Bob)',
    'Do NOT introduce realm-breaking combat ability without foreshadowing a unique physique, bloodline, or cheat',
    'Do NOT ignore the social consequences of rapidly rising through cultivation stages (envy, suspicion, political attention)',
    'Do NOT reduce sect politics to simple good vs. evil — power dynamics must be nuanced',
    'Do NOT use pills or treasures as a substitute for genuine character development during breakthroughs',
    'Do NOT forget that cultivators at higher stages should perceive and interact with the world fundamentally differently',
  ],

  auditDimensions: [
    {
      id: 'cultivation-consistency',
      name: 'Cultivation System Consistency',
      severity: 'critical',
      weight: 10,
      checkInstruction: 'Verify that cultivation stages, qi mechanics, and breakthrough requirements are consistent throughout. No contradictions in how the power system operates.',
    },
    {
      id: 'breakthrough-quality',
      name: 'Breakthrough Quality',
      severity: 'critical',
      weight: 9,
      checkInstruction: 'Check that breakthroughs involve genuine character insight or growth, not just consuming resources. Each breakthrough should change how the character perceives the world.',
    },
    {
      id: 'sect-politics',
      name: 'Sect and Social Dynamics',
      severity: 'warning',
      weight: 8,
      checkInstruction: 'Verify that sect hierarchies, face culture, and social dynamics are portrayed consistently and drive meaningful conflict.',
    },
    {
      id: 'combat-martial-arts',
      name: 'Combat and Martial Arts Quality',
      severity: 'warning',
      weight: 8,
      checkInstruction: 'Check that combat scenes integrate cultivation abilities with tactical thinking and martial arts technique descriptions.',
    },
    {
      id: 'dao-philosophy',
      name: 'Dao and Philosophy Integration',
      severity: 'warning',
      weight: 7,
      checkInstruction: 'Verify that philosophical elements (Dao, heart demons, inner demons, enlightenment) are woven into the narrative naturally, not just as flavor text.',
    },
    {
      id: 'worldbuilding-scope',
      name: 'Worldbuilding Scope',
      severity: 'warning',
      weight: 7,
      checkInstruction: 'Check that the world has regions, factions, history, and dangers beyond what the protagonist directly encounters.',
    },
    {
      id: 'lifespan-impact',
      name: 'Lifespan and Perspective',
      severity: 'info',
      weight: 5,
      checkInstruction: 'Verify that the extended lifespans of cultivators affect their relationships, worldviews, and decision-making.',
    },
    {
      id: 'resource-economy',
      name: 'Resource Economy',
      severity: 'info',
      weight: 5,
      checkInstruction: 'Check that spiritual resources (pills, herbs, beast cores, spirit stones) have consistent value and scarcity.',
    },
  ],

  pacingTemplate: [
    {
      phase: 'Mortal Origins',
      description: 'The protagonist begins as a mortal or low-level cultivator, establishing their world, background, and initial motivation to pursue the Dao.',
      wordCountRatio: 0.12,
      tensionLevel: 'low',
    },
    {
      phase: 'Entering the Path',
      description: 'The protagonist joins a sect or begins formal cultivation, learning the basics and forming early relationships and rivalries.',
      wordCountRatio: 0.18,
      tensionLevel: 'low',
    },
    {
      phase: 'Sect Trials',
      description: 'Competitions, missions, and sect politics test the protagonist. Early tribulations and breakthroughs establish their potential.',
      wordCountRatio: 0.2,
      tensionLevel: 'medium',
    },
    {
      phase: 'Wandering the Jianghu',
      description: 'The protagonist leaves the sect to explore the wider world, encountering new dangers, allies, and opportunities for growth.',
      wordCountRatio: 0.2,
      tensionLevel: 'high',
    },
    {
      phase: 'Heavenly Tribulation',
      description: 'A major tribulation tests the protagonist\'s cultivation, resolve, and Dao. Failure means death or regression; success means a quantum leap in power.',
      wordCountRatio: 0.18,
      tensionLevel: 'climax',
    },
    {
      phase: 'Transcendence',
      description: 'The protagonist emerges transformed, having achieved a new understanding of their Dao and their place in the world.',
      wordCountRatio: 0.12,
      tensionLevel: 'medium',
    },
  ],

  characterTypes: [
    {
      type: 'The Dao Seeker',
      description: 'A cultivator driven by a philosophical question or personal conviction that defines their path. Their Dao is not just power — it is identity.',
      requiredTraits: ['introspective', 'determined', 'philosophically inclined', 'willing to sacrifice'],
      avoidTraits: ['generic power-seeker', 'no personal philosophy', 'passive', 'motivated only by revenge'],
    },
    {
      type: 'The Sect Elder',
      description: 'A high-ranking cultivator whose wisdom and power shape the sect. May be a mentor, obstacle, or political player.',
      requiredTraits: ['layered motivations', 'cultivation wisdom', 'political awareness', 'hidden depths'],
      avoidTraits: ['one-dimensionally good or evil', 'instantly trusts protagonist', 'no personal agenda', 'exists only to teach'],
    },
    {
      type: 'The Young Master',
      description: 'A privileged, backed-by-powerful-figures antagonist who represents the corruption of the cultivation hierarchy.',
      requiredTraits: ['has legitimate backing', 'entitled but not stupid', 'escalates threat level', 'embodies systemic problems'],
      avoidTraits: ['brainlessly evil', 'never learns', 'always loses easily', 'exists only as fodder'],
    },
    {
      type: 'The Beast Companion',
      description: 'A spirit beast or demonic beast that bonds with the protagonist, growing alongside them as a combat partner.',
      requiredTraits: ['distinct personality', 'grows in power alongside protagonist', 'has its own instincts and needs', 'meaningful bond'],
      avoidTraits: ['just a weapon', 'no personality', 'instantly loyal', 'overpowered from the start'],
    },
  ],

  styleConstraints: {
    tone: ['philosophical and contemplative', 'epic during tribulations', 'political in sect arcs', 'wonder at spiritual phenomena'],
    vocabulary: ['Daoist terminology (qi, meridian, dantian, tribulation)', 'cultivation stage names', 'martial arts technique names', 'spiritual and elemental descriptors'],
    sentenceStyle: ['flowing prose for cultivation scenes', 'sharp and fast during combat', 'dialogue-heavy during political intrigue', 'poetic passages for enlightenment moments'],
    forbiddenWords: ['dude', 'gonna', 'ain\'t', 'y\'all', 'bro', 'freaking', 'cringe', 'yeet'],
  },

  metadata: {
    version: '1.0.0',
    updatedAt: Date.now(),
  },
}
