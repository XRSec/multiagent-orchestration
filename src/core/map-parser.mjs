const MAP_REGEX = /<!-- CINDY_MAP:BEGIN -->([\s\S]*?)<!-- CINDY_MAP:END -->/;
const VALID_ACTIONS = new Set(['RELAY', 'DISPATCH', 'P2P_QUERY', 'MENTION_ASSIGN', 'COMPLETE']);

export class MapProtocolValidationError extends Error {
  constructor(message, details = {}) {
    super(`MAP Protocol Error: ${message}`);
    this.name = 'MapProtocolValidationError';
    this.details = details;
  }
}

/**
 * Validates the parsed MAP envelope object against the specification schema.
 */
export function validateMapPacket(packet) {
  if (!packet || typeof packet !== 'object') {
    throw new MapProtocolValidationError('Packet must be a valid JSON object.');
  }

  if (packet.version !== '1.0.0') {
    throw new MapProtocolValidationError(`Unsupported MAP version: ${packet.version}. Expected 1.0.0.`);
  }

  if (!packet.action || !VALID_ACTIONS.has(packet.action)) {
    throw new MapProtocolValidationError(
      `Invalid action: "${packet.action}". Expected one of: ${Array.from(VALID_ACTIONS).join(', ')}`
    );
  }

  if (!packet.sender || typeof packet.sender !== 'string') {
    throw new MapProtocolValidationError('Field "sender" must be a non-empty string.');
  }

  if (!packet.target || typeof packet.target !== 'string') {
    throw new MapProtocolValidationError('Field "target" must be a non-empty string.');
  }

  if (!packet.task_id || typeof packet.task_id !== 'string') {
    throw new MapProtocolValidationError('Field "task_id" must be a non-empty string.');
  }

  if (!packet.payload || typeof packet.payload !== 'object') {
    throw new MapProtocolValidationError('Field "payload" must be an object.');
  }

  if (typeof packet.payload.summary !== 'string') {
    throw new MapProtocolValidationError('Field "payload.summary" must be a string.');
  }

  if (packet.action === 'DISPATCH') {
    if (!Array.isArray(packet.payload.subtasks) || packet.payload.subtasks.length === 0) {
      throw new MapProtocolValidationError('DISPATCH action requires a non-empty payload.subtasks array.');
    }
    for (const [idx, subtask] of packet.payload.subtasks.entries()) {
      if (!subtask.target || typeof subtask.target !== 'string') {
        throw new MapProtocolValidationError(`Subtask at index ${idx} missing valid "target" string.`);
      }
      if (!subtask.instruction || typeof subtask.instruction !== 'string') {
        throw new MapProtocolValidationError(`Subtask at index ${idx} missing valid "instruction" string.`);
      }
    }
  }

  if (packet.action === 'P2P_QUERY') {
    if (!packet.payload.p2p_query || typeof packet.payload.p2p_query !== 'string') {
      throw new MapProtocolValidationError('P2P_QUERY action requires non-empty payload.p2p_query string.');
    }
  }

  return true;
}

/**
 * Extracts, parses, validates, and strips MAP envelope from raw text.
 * If no MAP envelope is present, constructs a default COMPLETE packet.
 */
export function parseMapEnvelope(rawText, fallbackContext = {}) {
  const text = rawText || '';
  const match = text.match(MAP_REGEX);

  if (!match) {
    const cleanText = text.trim();
    return {
      hasMap: false,
      cleanText,
      packet: {
        version: '1.0.0',
        action: 'COMPLETE',
        sender: fallbackContext.sender || 'unknown',
        target: fallbackContext.target || 'user',
        task_id: fallbackContext.taskId || 'unassigned',
        payload: {
          summary: cleanText,
          artifacts: [],
        },
      },
    };
  }

  const jsonString = match[1].trim();
  const cleanText = text.replace(MAP_REGEX, '').trim();

  let parsedJson;
  try {
    parsedJson = JSON.parse(jsonString);
  } catch (err) {
    throw new MapProtocolValidationError(`Failed to parse MAP envelope JSON: ${err.message}`, {
      rawJson: jsonString,
    });
  }

  validateMapPacket(parsedJson);

  return {
    hasMap: true,
    cleanText,
    packet: parsedJson,
  };
}

/**
 * Formats a MAP packet into the canonical envelope string representation.
 */
export function formatMapEnvelope(packet) {
  validateMapPacket(packet);
  return `<!-- CINDY_MAP:BEGIN -->\n${JSON.stringify(packet, null, 2)}\n<!-- CINDY_MAP:END -->`;
}
