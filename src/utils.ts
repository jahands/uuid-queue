import { UUIDMessage } from "./types";

/**
 * Subtracts the given number of hours from the given date.
 * @param numOfHours - number of hours to go back
 * @param date Optional date to go back from. Defaults to now.
 * @returns Date object representing the date numOfHours ago
 */
export function subtractHours(numOfHours: number, date = new Date()): Date {
	date.setHours(date.getHours() - numOfHours);
	return date;
}

/**
 * Typeguard for UUIDMessage
 * @param msg - message to check
 * @returns whether the given message is a UUIDMessage
 */
export function isUUIDMessage(msg: any): msg is UUIDMessage {
	return msg !== undefined &&
		typeof msg === 'object' &&
		msg !== null &&
		typeof msg.id === 'string' &&
		msg.id.length > 0 &&
		typeof msg.id_type === 'number' &&
		typeof msg.ts === 'number'
}

/**
 * Gets a key for deduping UUIDMessages
 * @param msg - message to get the dedupe key for.
 * @returns a string that can be used in a map for deduplication
 */
export function getDedupeKey(msg: UUIDMessage): string {
  return `${msg.ts}-${msg.id_type}-${msg.id}`
}
