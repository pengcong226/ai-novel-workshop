import { GenreProfile } from '@/types/genreProfile'

export const isekaiProfile: GenreProfile = {
  id: 'en-isekai',
  name: 'Isekai',
  description: 'A genre where the protagonist is transported, reincarnated, or summoned into another world. Explores adaptation, world discovery, and leveraging knowledge or abilities from the original world in a new context.',

  writingRules: [
    'The transition from the original world to the new world must be a significant narrative moment with emotional weight',
    'The protagonist\'s prior-world knowledge must be relevant but not all-powerful — adaptation is key',
    'The new world must have deep, consistent worldbuilding that rewards exploration and discovery',
    'Culture shock and adaptation challenges should be portrayed realistically, not glossed over',
    'The protagonist should have a clear motivation for engaging with the new world beyond mere survival',
    'Supporting characters in the new world must have their own histories, motivations, and agency',
    'The "cheat skill" or advantage from the original world should have limitations and costs',
    'Language barriers, if applicable, should be addressed rather than hand-waved',
    'The protagonist should face genuine moral dilemmas rooted in the clash between their old and new world values',
    'World discovery should be paced naturally — the reader learns about the world alongside the protagonist',
    'Homesickness, identity crisis, and existential questions about belonging should be explored',
    'The narrative should avoid reducing the new world to a mere backdrop for power fantasy',
    'Foreshadow connections between the two worlds that create mystery and plot hooks',
  ],

  genreRules: [
    'The method of transportation (summoned, reincarnated, accident, chosen) must be clearly established with rules',
    'The protagonist must adapt to the new world\'s culture, magic system, or technology over time',
    'Prior-world knowledge should provide an advantage but not trivialize challenges in the new world',
    'The new world must have its own history, politics, and conflicts that exist independently of the protagonist',
    'Other transported individuals (if any) should have different experiences and outcomes to show the protagonist is not special by default',
    'The question of whether the protagonist can or should return home should be a recurring thematic tension',
  ],

  prohibitions: [
    'Do NOT make the protagonist instantly master every aspect of the new world without effort or failure',
    'Do NOT ignore the emotional impact of being separated from family, friends, and everything familiar',
    'Do NOT create a new world that exists solely to validate the protagonist\'s modern-world knowledge',
    'Do NOT introduce a "harem" of characters who exist only to worship the protagonist without their own goals',
    'Do NOT use the isekai premise as mere window dressing — the transportation must drive meaningful story themes',
    'Do NOT allow the protagonist to trivially introduce modern technology without addressing material and knowledge constraints',
    'Do NOT neglect the perspective of native inhabitants who must deal with an overpowered outsider',
  ],

  auditDimensions: [
    {
      id: 'transition-weight',
      name: 'Transition Emotional Weight',
      severity: 'critical',
      weight: 9,
      checkInstruction: 'Verify that the world transition is treated as a significant life event with genuine emotional consequences, not just a plot device.',
    },
    {
      id: 'worldbuilding-depth',
      name: 'Worldbuilding Depth',
      severity: 'critical',
      weight: 10,
      checkInstruction: 'Check that the new world has consistent rules, history, culture, and politics that extend beyond what the protagonist directly interacts with.',
    },
    {
      id: 'adaptation-realism',
      name: 'Adaptation Realism',
      severity: 'critical',
      weight: 8,
      checkInstruction: 'Verify that the protagonist\'s adaptation to the new world is gradual and realistic, with genuine struggles and learning curves.',
    },
    {
      id: 'prior-knowledge-balance',
      name: 'Prior Knowledge Balance',
      severity: 'warning',
      weight: 8,
      checkInstruction: 'Check that the protagonist\'s original-world knowledge provides advantages but does not trivialize challenges or make them invincible.',
    },
    {
      id: 'native-character-agency',
      name: 'Native Character Agency',
      severity: 'warning',
      weight: 7,
      checkInstruction: 'Verify that characters native to the new world have their own motivations, goals, and agency — not just reacting to the protagonist.',
    },
    {
      id: 'emotional-continuity',
      name: 'Emotional Continuity',
      severity: 'warning',
      weight: 6,
      checkInstruction: 'Check that the protagonist\'s emotional journey (homesickness, identity, belonging) is maintained throughout, not abandoned after the first act.',
    },
    {
      id: 'cheat-limitations',
      name: 'Cheat Skill Limitations',
      severity: 'warning',
      weight: 7,
      checkInstruction: 'Verify that any special ability or advantage from the original world has clear limitations, costs, or growth requirements.',
    },
    {
      id: 'cultural-clash',
      name: 'Cultural Clash Exploration',
      severity: 'info',
      weight: 5,
      checkInstruction: 'Check that value conflicts between the protagonist\'s original and new world cultures are explored meaningfully.',
    },
  ],

  pacingTemplate: [
    {
      phase: 'Displacement',
      description: 'The protagonist is transported to the new world. Confusion, disorientation, and the initial shock of a new reality are established.',
      wordCountRatio: 0.12,
      tensionLevel: 'medium',
    },
    {
      phase: 'Orientation',
      description: 'The protagonist learns the basics of the new world — its rules, dangers, and opportunities. Early allies and enemies are encountered.',
      wordCountRatio: 0.2,
      tensionLevel: 'low',
    },
    {
      phase: 'Integration',
      description: 'The protagonist begins to find their place in the new world, using prior knowledge or unique abilities to gain a foothold.',
      wordCountRatio: 0.2,
      tensionLevel: 'medium',
    },
    {
      phase: 'Entanglement',
      description: 'The protagonist becomes invested in the new world\'s conflicts and people. Stakes become personal rather than purely survival-driven.',
      wordCountRatio: 0.2,
      tensionLevel: 'high',
    },
    {
      phase: 'Crisis',
      description: 'A major threat forces the protagonist to fully commit to the new world, potentially sacrificing the possibility of returning home.',
      wordCountRatio: 0.18,
      tensionLevel: 'climax',
    },
    {
      phase: 'Belonging',
      description: 'The protagonist resolves the crisis and finds or earns their sense of belonging in the new world. The question of home is answered.',
      wordCountRatio: 0.1,
      tensionLevel: 'medium',
    },
  ],

  characterTypes: [
    {
      type: 'The Displaced Protagonist',
      description: 'An ordinary person (or someone with a specific skill set) thrust into an extraordinary world, forced to adapt and grow.',
      requiredTraits: ['adaptable', 'resourceful', 'carries emotional baggage from original world', 'curious'],
      avoidTraits: ['instantly perfect at everything', 'no emotional reaction to displacement', 'passive observer', 'pure power fantasy vessel'],
    },
    {
      type: 'The Native Guide',
      description: 'A local who introduces the protagonist to the new world\'s rules, culture, and dangers. Has their own life and problems.',
      requiredTraits: ['knowledgeable about their world', 'skeptical of outsider', 'has own goals', 'capable in their own right'],
      avoidTraits: ['instantly devoted to protagonist', 'no personality beyond guide role', 'helpless without protagonist', 'exposition machine'],
    },
    {
      type: 'The World Authority',
      description: 'A leader, ruler, or powerful figure whose decisions shape the world the protagonist must navigate.',
      requiredTraits: ['political savvy', 'complex motivations', 'awareness of protagonist as anomaly', 'makes hard choices'],
      avoidTraits: ['corrupt for no reason', 'easily manipulated', 'exists only to oppose or help protagonist', 'one-note villain'],
    },
    {
      type: 'The Fellow Outworlder',
      description: 'Another person from the original world who was transported separately, offering a mirror or foil to the protagonist\'s choices.',
      requiredTraits: ['different adaptation path', 'contrasting values', 'complex relationship with protagonist', 'embodies a "what if" scenario'],
      avoidTraits: ['identical to protagonist', 'purely antagonistic', 'no independent motivation', 'disposable plot device'],
    },
  ],

  styleConstraints: {
    tone: ['sense of wonder and discovery', 'fish-out-of-water humor', 'genuine emotional depth', 'adventurous and exploratory'],
    vocabulary: ['world-specific terminology', 'cultural references from both worlds', 'descriptive language for new environments', 'internal monologue contrasting old and new'],
    sentenceStyle: ['detailed descriptive passages for new environments', 'short reactive sentences during action', 'reflective passages for emotional moments', 'dialogue that highlights cultural differences'],
    forbiddenWords: ['bruh', 'fam', 'lowkey', 'highkey', 'no cap', 'slay', 'vibe check', 'sus'],
  },

  metadata: {
    version: '1.0.0',
    updatedAt: Date.now(),
  },
}
