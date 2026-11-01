// Only these fixed messages cross the callable boundary. Never expose provider
// response bodies, keys, prompts, generated content, or arbitrary exception text.
const messages = {
  research: 'The source search did not return usable evidence. No unsupported real-world story has been substituted. Please retry when the source service is available.',
  editorial: 'Automatic editorial repair did not reach the required standard in this run. No unfinished lesson has been created. Your brief and approved plan are safe.',
  billing: 'OpenAI reports that the API account has no available quota. Check the billing balance and organisation associated with this API key.',
  credentials: 'OpenAI rejected the configured API key. The administrator needs to check the server secret.',
  model_access: 'The API account cannot access the configured model. The administrator needs to check model access.',
  access: 'OpenAI denied this request. The administrator needs to check API account permissions and regional availability.',
  rate_limit: 'OpenAI temporarily rate-limited this request. Wait before trying again.',
  request: 'OpenAI rejected the request format. The administrator needs to check the integration.',
  provider: 'OpenAI could not complete the request because of a service error.',
  timeout: 'The AI request exceeded its 180-second time limit.',
  connection: 'The server lost its connection to the AI service.',
  output_limit: 'The AI response reached its output limit before completing.',
  incomplete: 'The AI service returned an incomplete response.',
  refusal: 'The AI service declined to generate this content. Revise the brief before trying again.',
  output_validation: 'The AI response did not pass the required content checks.',
  usage: 'The AI service returned unexpected usage information. Generation was stopped to protect the spending allowance.',
  content: 'The activities need another content check. Your approved plan is saved; retry this step without starting a new plan.',
  sequence: 'The generated stages did not match the approved outline or lesson duration.',
  storage: 'The server could not finish saving the generation result.',
  unknown: 'The server could not complete this generation.',
};
export class GenerationError extends Error {
  constructor(reason) { super(messages[reason] ?? messages.unknown); this.reason = Object.hasOwn(messages, reason) ? reason : 'unknown'; }
}
export function describeFailure(error, phase) {
  const reason = error instanceof GenerationError ? error.reason : 'unknown';
  const step = ['outline', 'plan', 'activities', 'review', 'storage'].includes(phase) ? phase : 'unknown';
  return { reason, phase: step, message: `${messages[reason]} Your current brief and outline have not been replaced. Start a new generation when ready. [${step}:${reason}]` };
}
export function httpFailure(status, code) {
  const reason = code === 'insufficient_quota' ? 'billing'
    : status === 401 ? 'credentials'
    : code === 'model_not_found' ? 'model_access'
    : status === 403 ? 'access'
    : status === 429 ? 'rate_limit'
    : status === 400 || status === 422 ? 'request' : 'provider';
  return new GenerationError(reason);
}
