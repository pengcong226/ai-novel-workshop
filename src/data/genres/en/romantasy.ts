import { GenreProfile } from '@/types/genreProfile'

export const romantasyProfile: GenreProfile = {
  id: 'en-romantasy',
  name: 'Romantasy',
  description: 'A genre blending romance and fantasy, where the love story is inseparable from the fantasy plot. Features magical worlds, court intrigue, enemies-to-lovers dynamics, and epic stakes intertwined with deep emotional connections.',

  writingRules: [
    'The romance and the fantasy plot must be structurally intertwined — removing either should collapse the narrative',
    'Both love interests must be fully realized characters with their own goals, flaws, and character arcs',
    'Emotional tension must build gradually through meaningful interactions, not just physical attraction',
    'The power dynamic between love interests must be examined and evolved — initial imbalances should be addressed',
    'Court politics, magical systems, and world events should directly affect the romantic relationship and vice versa',
    'Vulnerability must be earned — characters should open up at narratively appropriate moments, not prematurely',
    'Intimate scenes (if included) must advance character development or relationship dynamics, not exist in isolation',
    'The fantasy setting must create unique obstacles and opportunities for the romance that a contemporary setting could not',
    'Miscommunication as a conflict driver should be minimized — conflicts should stem from genuine differences in values, loyalty, or circumstances',
    'Supporting characters should have opinions about the relationship that reflect their own values and interests',
    'The "happily ever after" (or happy-for-now) must feel earned through genuine sacrifice and growth from both characters',
    'Magical bonds, fated mates, or soulmate mechanics should not replace genuine emotional development',
    'Both characters must have agency in the relationship — the romance should not be one person pursuing while the other passively receives',
  ],

  genreRules: [
    'The romance must be a primary narrative driver, not a subplot that can be removed without consequence',
    'Fantasy elements (magic, politics, prophecy) must directly create obstacles or catalysts for the romantic relationship',
    'Both love interests must demonstrate growth that makes them worthy of each other by the story\'s end',
    'The "dark" or morally grey love interest must have genuine complexity — not just aesthetic darkness with no real moral weight',
    'Court intrigue, fae bargains, magical curses, or political marriages should create organic relationship tension',
    'The resolution of the central romance should coincide with or directly enable the resolution of the fantasy plot',
  ],

  prohibitions: [
    'Do NOT reduce either love interest to a trophy or reward for the other\'s character development',
    'Do NOT use magical bonds or fate to bypass the need for genuine emotional connection and choice',
    'Do NOT include "dark romance" elements (obsessive behavior, possessiveness, coercion) without examining their toxicity',
    'Do NOT make the romance subplot feel disconnected from the main fantasy plot — they must be structurally interwoven',
    'Do NOT use miscommunication as the primary source of conflict when real, substantive conflicts are available',
    'Do NOT have one love interest be significantly more competent or powerful without addressing the power imbalance',
    'Do NOT neglect the supporting cast in favor of the central couple — secondary characters enrich the world and the romance',
    'Do NOT rush the enemies-to-lovers transition — the shift from antagonism to trust must be gradual and motivated',
  ],

  auditDimensions: [
    {
      id: 'romance-plot-integration',
      name: 'Romance-Plot Integration',
      severity: 'critical',
      weight: 10,
      checkInstruction: 'Verify that the romance and fantasy plot are structurally intertwined. Removing the romance should break the plot, and vice versa.',
    },
    {
      id: 'character-agency',
      name: 'Character Agency in Romance',
      severity: 'critical',
      weight: 9,
      checkInstruction: 'Check that both love interests have agency, make active choices in the relationship, and are not passive recipients of the other\'s actions.',
    },
    {
      id: 'emotional-arc-quality',
      name: 'Emotional Arc Quality',
      severity: 'critical',
      weight: 9,
      checkInstruction: 'Verify that the emotional arc of the romance is gradual, earned, and driven by genuine character interactions — not just physical attraction or magical compulsion.',
    },
    {
      id: 'power-dynamic',
      name: 'Power Dynamic Exploration',
      severity: 'warning',
      weight: 8,
      checkInstruction: 'Check that power imbalances between love interests are acknowledged and addressed, not ignored or romanticized uncritically.',
    },
    {
      id: 'both-characters-well-rounded',
      name: 'Both Characters Well-Rounded',
      severity: 'warning',
      weight: 8,
      checkInstruction: 'Verify that both love interests have independent goals, flaws, backstories, and arcs that exist outside the romance.',
    },
    {
      id: 'fantasy-romance-synergy',
      name: 'Fantasy-Romance Synergy',
      severity: 'warning',
      weight: 7,
      checkInstruction: 'Check that fantasy elements create unique romantic obstacles and opportunities that a contemporary setting could not provide.',
    },
    {
      id: 'supporting-cast-enrichment',
      name: 'Supporting Cast Enrichment',
      severity: 'info',
      weight: 5,
      checkInstruction: 'Verify that supporting characters have their own perspectives on the central relationship and contribute to the world beyond the couple.',
    },
    {
      id: 'intimate-scene-purpose',
      name: 'Intimate Scene Purpose',
      severity: 'info',
      weight: 5,
      checkInstruction: 'Check that any intimate or romantic scenes serve a narrative purpose — advancing character development, shifting power dynamics, or deepening emotional connection.',
    },
  ],

  pacingTemplate: [
    {
      phase: 'Collision',
      description: 'The love interests meet under circumstances of conflict, obligation, or danger. First impressions are charged with tension — attraction, antagonism, or both.',
      wordCountRatio: 0.15,
      tensionLevel: 'medium',
    },
    {
      phase: 'Reluctant Proximity',
      description: 'Circumstances force the characters together. Walls come down incrementally through shared challenges and unexpected moments of vulnerability.',
      wordCountRatio: 0.2,
      tensionLevel: 'medium',
    },
    {
      phase: 'Deepening',
      description: 'Trust builds through meaningful interactions. Secrets are shared, loyalties tested, and the emotional stakes of the fantasy plot begin to affect the relationship.',
      wordCountRatio: 0.2,
      tensionLevel: 'high',
    },
    {
      phase: 'The Rift',
      description: 'A betrayal, misunderstanding, or impossible choice drives the characters apart. The fantasy plot and romantic conflict converge at their most painful.',
      wordCountRatio: 0.15,
      tensionLevel: 'high',
    },
    {
      phase: 'Reckoning',
      description: 'Both characters confront their flaws, make sacrifices, and choose each other despite the cost. The fantasy climax and romantic resolution become one.',
      wordCountRatio: 0.2,
      tensionLevel: 'climax',
    },
    {
      phase: 'Resolution',
      description: 'The fantasy conflict resolves, and the relationship is transformed — not returned to its beginning state, but matured through everything it has survived.',
      wordCountRatio: 0.1,
      tensionLevel: 'low',
    },
  ],

  characterTypes: [
    {
      type: 'The Fierce Protagonist',
      description: 'A determined, often underestimated character who drives the fantasy plot forward while navigating a complicated romantic entanglement.',
      requiredTraits: ['strong-willed', 'emotionally guarded', 'competent in their domain', 'capable of growth and vulnerability'],
      avoidTraits: ['passive love interest', 'special without earning it', 'no personality beyond the romance', 'perfect at everything'],
    },
    {
      type: 'The Morally Grey Love Interest',
      description: 'A compelling, often dangerous figure whose moral ambiguity creates both attraction and conflict. Not a simple villain or saint.',
      requiredTraits: ['genuinely complex morality', 'hidden vulnerability', 'competent and dangerous', 'capable of real change'],
      avoidTraits: ['toxic behavior excused by attractiveness', 'secretly just good all along', 'possessive as romantic', 'no real flaws'],
    },
    {
      type: 'The Loyal Companion',
      description: 'A best friend, sibling, or sworn protector who offers perspective on the romance and grounds the protagonist in their identity.',
      requiredTraits: ['honest with protagonist', 'own subplot or goal', 'calls out bad decisions', 'provides emotional grounding'],
      avoidTraits: ['pure comic relief', 'only exists to discuss the love interest', 'no independent arc', 'dies for motivation'],
    },
    {
      type: 'The Antagonist',
      description: 'A political, magical, or personal enemy whose threat forces the love interests together while simultaneously threatening to tear them apart.',
      requiredTraits: ['genuine threat', 'complicated motivation', 'connected to both protagonists', 'forces hard choices'],
      avoidTraits: ['evil for evil\'s sake', 'easily defeated', 'exists only to test the romance', 'one-dimensional'],
    },
  ],

  styleConstraints: {
    tone: ['emotionally charged', 'atmospheric and immersive', 'tension-filled', 'sensual and evocative'],
    vocabulary: ['emotional and sensory language', 'court and political terminology', 'magical system vocabulary', 'intimate and vulnerable diction'],
    sentenceStyle: ['lush descriptive passages for world and emotion', 'sharp dialogue for banter and conflict', 'short breathless sentences during tension', 'long flowing prose for romantic and magical moments'],
    forbiddenWords: ['bro', 'dude', 'lol', 'gonna', 'ain\'t', 'y\'all', 'fam', 'yeet'],
  },

  metadata: {
    version: '1.0.0',
    updatedAt: Date.now(),
  },
}
