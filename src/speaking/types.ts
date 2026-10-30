export type SpeakingConfig = { id: string; feedbackMode?: 'lesson' | 'task' | 'learner'; focusOptions?: string[]; lessonId?: string; title: string; scenario: string; focus: string; learnerRole: string; partnerRole: string; level: string; seconds: number };
export type SpeakingTurn = { role: 'learner' | 'partner'; text: string; at: number };
export type SpeakingFeedback = { focusFeedback: string; evidence: string[]; communication: string; nextStep: string; retryPrompt: string };
export type SpeakingSession = { id: string; uid: string; name: string; status: string; startedAt: number; deadline: number; updatedAt: number; turns: SpeakingTurn[]; help?: boolean; config?: SpeakingConfig; feedback?: SpeakingFeedback; feedbackState?: string };
