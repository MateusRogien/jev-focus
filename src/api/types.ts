/*
 * Provider-neutral shapes for a Jev System One request and response.
 *
 * Wire format (TypeSafe /v1/systemone; OpenRouter and NanoGPT /decisions mirror it):
 *   request  { model, state, questions: { [id]: { type, instructions, criteria? } } }
 *   response { model, answers: { [id]: ChoiceAnswer | NoulAnswer }, usage: { input_tokens } }
 *
 * choice criteria: { [optionKey]: description }   (2–255 options)
 * noul criteria:   { true: description, false: description }   (optional)
 */

export interface ChoiceQuestion {
  type: 'choice';
  instructions: string;
  criteria: Record<string, string>;
}

export interface NoulQuestion {
  type: 'noul';
  instructions: string;
  criteria?: { true: string; false: string };
}

export type Question = ChoiceQuestion | NoulQuestion;

export interface JevRequest {
  state: string;
  questions: Record<string, Question>;
}

export interface ChoiceAnswer {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence?: number;
}

export interface NoulAnswer {
  type: 'noul';
  probability: number;
}

export type Answer = ChoiceAnswer | NoulAnswer;

export interface JevResponse {
  answers: Record<string, Answer>;
  model?: string;
  inputTokens?: number;
}
