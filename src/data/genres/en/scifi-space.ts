import { GenreProfile } from '@/types/genreProfile'

export const scifiSpaceProfile: GenreProfile = {
  id: 'en-scifi-space',
  name: 'Sci-Fi Space Opera',
  description: 'Grand-scale science fiction set across multiple star systems, featuring interstellar civilizations, advanced technology, space warfare, and sweeping political drama. Emphasizes spectacle, wonder, and the human condition across cosmic distances.',

  writingRules: [
    'Scale must be conveyed through concrete details — ship crew sizes, travel times, planetary populations — not just abstract numbers',
    'Space travel logistics (FTL mechanics, fuel, communications delay) must be consistent and affect plot decisions',
    'Alien civilizations must feel genuinely alien in biology, culture, and cognition — not just humans with forehead ridges',
    'Political structures (empires, federations, alliances, corporations) must have realistic internal tensions and factions',
    'Technology must shape society, warfare, and daily life in ways that feel natural and explored',
    'Space battles must consider three-dimensional tactics, energy budgets, and communication limitations',
    'Characters must feel the psychological weight of space: isolation, distance from loved ones, the overview effect',
    'First contact scenarios must address the Fermi paradox implications and communication challenges',
    'Economic systems (trade routes, resource scarcity, corporate interests) must drive realistic political motivations',
    'The vastness of space should create both wonder and dread — it is not merely a backdrop for action',
    'Crew dynamics on ships should reflect the stress of confined, high-stakes environments',
    'Historical parallels to colonialism, imperialism, or Cold War dynamics should be intentional and examined, not accidental',
    'AI, transhumanism, and post-scarcity themes should be explored with nuance, not simple utopia/dystopia binaries',
  ],

  genreRules: [
    'FTL travel must have defined rules (jump drives, warp gates, hyperspace lanes) with strategic implications',
    'Communication across interstellar distances must have realistic delays or infrastructure requirements',
    'Alien species must have non-human psychology, reproduction, and social structures that affect their behavior',
    'Space combat must account for inertia, energy weapons vs. kinetics, point defense, and the reality of no sound in vacuum',
    'Planetary environments must affect culture, biology, and politics — not just be interchangeable settings',
    'Economic and resource pressures must drive interstellar politics and conflict, not just ideological disagreements',
  ],

  prohibitions: [
    'Do NOT treat space as a simple ocean analogy — the physics, scale, and emptiness of space are fundamentally different',
    'Do NOT make all alien species monocultures (the "planet of hats" trope) unless it is deliberately examined',
    'Do NOT ignore the time implications of interstellar distances — messages and travel should take realistic time',
    'Do NOT create a galactic empire that functions like a modern nation-state without addressing governance at scale',
    'Do NOT use technology as magic — it must have consistent capabilities, limitations, and maintenance requirements',
    'Do NOT have space battles that ignore the three-dimensional nature of space and the vast distances involved',
    'Do NOT introduce artificial gravity, shields, or life support without addressing their implications for society and warfare',
    'Do NOT treat AI characters as either perfectly loyal servants or inevitable traitors — explore the nuance',
  ],

  auditDimensions: [
    {
      id: 'scale-consistency',
      name: 'Scale and Distance Consistency',
      severity: 'critical',
      weight: 10,
      checkInstruction: 'Verify that distances, travel times, and population scales are consistent and that the narrative respects the implications of interstellar scale.',
    },
    {
      id: 'technology-consistency',
      name: 'Technology Consistency',
      severity: 'critical',
      weight: 10,
      checkInstruction: 'Check that all technology (FTL, weapons, AI, communications) operates under consistent rules and does not contradict established capabilities.',
    },
    {
      id: 'alien-authenticity',
      name: 'Alien Civilization Authenticity',
      severity: 'critical',
      weight: 8,
      checkInstruction: 'Verify that alien species have genuinely non-human perspectives, biology, and culture — not just superficial differences from humans.',
    },
    {
      id: 'political-realism',
      name: 'Political Realism',
      severity: 'warning',
      weight: 8,
      checkInstruction: 'Check that interstellar politics reflects realistic governance challenges, faction dynamics, and economic pressures.',
    },
    {
      id: 'space-combat-realism',
      name: 'Space Combat Realism',
      severity: 'warning',
      weight: 7,
      checkInstruction: 'Verify that space battles consider physics (inertia, energy, distance), three-dimensional tactics, and communication constraints.',
    },
    {
      id: 'psychological-depth',
      name: 'Psychological Depth',
      severity: 'warning',
      weight: 6,
      checkInstruction: 'Check that characters show the psychological effects of space travel, isolation, first contact, and living in a vast universe.',
    },
    {
      id: 'economic-plausibility',
      name: 'Economic Plausibility',
      severity: 'info',
      weight: 5,
      checkInstruction: 'Verify that trade, resource scarcity, and economic interests drive realistic motivations and conflicts.',
    },
    {
      id: 'worldbuilding-ecology',
      name: 'Worldbuilding Ecology',
      severity: 'info',
      weight: 5,
      checkInstruction: 'Check that planetary environments affect their inhabitants\' biology, culture, and politics in believable ways.',
    },
  ],

  pacingTemplate: [
    {
      phase: 'The Known World',
      description: 'Establish the protagonist\'s immediate world — their ship, station, or homeworld — and the political landscape they inhabit.',
      wordCountRatio: 0.15,
      tensionLevel: 'low',
    },
    {
      phase: 'The Mission',
      description: 'A journey or assignment takes the protagonist beyond familiar territory, introducing the scope of the galaxy and its dangers.',
      wordCountRatio: 0.2,
      tensionLevel: 'medium',
    },
    {
      phase: 'First Contact',
      description: 'The protagonist encounters the alien, the unknown, or the enemy — forcing a confrontation with the vastness of the universe.',
      wordCountRatio: 0.2,
      tensionLevel: 'high',
    },
    {
      phase: 'Escalation',
      description: 'Political tensions, military threats, or cosmic mysteries escalate beyond the protagonist\'s initial understanding.',
      wordCountRatio: 0.2,
      tensionLevel: 'high',
    },
    {
      phase: 'The Crucible',
      description: 'A decisive battle, diplomatic crisis, or discovery that reshapes the protagonist\'s understanding of their galaxy.',
      wordCountRatio: 0.15,
      tensionLevel: 'climax',
    },
    {
      phase: 'New Horizons',
      description: 'The conflict resolves, but the galaxy is forever changed. New frontiers and questions emerge.',
      wordCountRatio: 0.1,
      tensionLevel: 'medium',
    },
  ],

  characterTypes: [
    {
      type: 'The Ship Captain / Commander',
      description: 'A leader responsible for crew and vessel, making impossible decisions at the frontier of known space.',
      requiredTraits: ['decisive under pressure', 'tactical mind', 'burden of responsibility', 'complex moral compass'],
      avoidTraits: ['infallible leader', 'reckless without consequence', 'no emotional depth', 'pure action hero'],
    },
    {
      type: 'The Alien Diplomat / Envoy',
      description: 'A representative of a non-human civilization whose perspective challenges human assumptions.',
      requiredTraits: ['genuinely non-human thinking', 'culturally distinct', 'has own agenda', 'bridges two worldviews'],
      avoidTraits: ['basically human', 'instantly trusts humans', 'no cultural baggage', 'exotic for exotic\'s sake'],
    },
    {
      type: 'The Rogue Scientist / Engineer',
      description: 'A brilliant mind pushing the boundaries of technology or understanding, often at moral cost.',
      requiredTraits: ['intellectually curious', 'morally flexible', 'essential to the mission', 'haunted by past discoveries'],
      avoidTraits: ['mad scientist cliché', 'purely exposition device', 'no social connections', 'infallible problem-solver'],
    },
    {
      type: 'The Political Operator',
      description: 'A politician, spy, or corporate executive whose machinations shape the galactic stage from behind the scenes.',
      requiredTraits: ['strategic thinker', 'manipulative but principled', 'connected to power structures', 'sees the big picture'],
      avoidTraits: ['cartoonishly corrupt', 'one-dimensional villain', 'incompetent', 'no personal stakes'],
    },
  ],

  styleConstraints: {
    tone: ['grand and sweeping', 'awe-inspiring', 'politically sharp', 'philosophically questioning'],
    vocabulary: ['nautical-influenced ship terminology', 'scientific and astronomical terms', 'political and diplomatic language', 'alien linguistic flavor'],
    sentenceStyle: ['wide-lens descriptive passages for cosmic scenes', 'tight tactical prose for battles', 'dialogue-driven political scenes', 'introspective passages for existential themes'],
    forbiddenWords: ['bruh', 'lowkey', 'no cap', 'vibe', 'slay', 'bussin', 'rizz', 'gyatt'],
  },

  metadata: {
    version: '1.0.0',
    updatedAt: Date.now(),
  },
}
