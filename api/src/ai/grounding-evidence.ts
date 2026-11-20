import Joi from 'joi';
import type {
  DiagnosticLog,
  GroundedObservation,
  GroundingPassage,
} from './python-diagnostics.client.js';

export const groundedObservationSchema = Joi.object({
  claim: Joi.string().min(8).max(500).required(),
  log_id: Joi.string().min(1).max(200).required(),
  log_quote: Joi.string().min(8).max(500).required(),
  passage_id: Joi.string().min(1).max(200).required(),
  passage_quote: Joi.string().min(8).max(500).required(),
}).unknown(false);

export function hasGroundedSupport(
  observation: GroundedObservation,
  logs: DiagnosticLog[],
  passages: GroundingPassage[],
): boolean {
  return (
    observation.claim === observation.log_quote &&
    logs.some(
      (log) =>
        log.id === observation.log_id &&
        ['ERROR', 'WARN'].includes(log.level) &&
        log.message.includes(observation.log_quote),
    ) &&
    passages.some(
      (passage) =>
        passage.chunkId === observation.passage_id &&
        passage.content.includes(observation.passage_quote),
    )
  );
}
