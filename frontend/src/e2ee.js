const ENCRYPTED_MESSAGE_PREFIX = "edgechat:e2ee:v1:";
const PBKDF2_ITERATIONS = 200000;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function getCrypto() {
	return globalThis.crypto?.subtle ? globalThis.crypto : null;
}

export function isEncryptedMessageContent(content) {
	return (
		typeof content === "string" && content.startsWith(ENCRYPTED_MESSAGE_PREFIX)
	);
}

function toBase64Url(bytes) {
	let binary = "";
	for (const byte of bytes) {
		binary += String.fromCharCode(byte);
	}
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");
}

function fromBase64Url(value) {
	const normalized = String(value || "")
		.replace(/-/g, "+")
		.replace(/_/g, "/");
	const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
	const binary = atob(padded);
	return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function deriveKey(passphrase, salt) {
	const crypto = getCrypto();
	if (!crypto) {
		throw new Error("当前浏览器不支持端对端加密");
	}

	const material = await crypto.subtle.importKey(
		"raw",
		encoder.encode(passphrase),
		"PBKDF2",
		false,
		["deriveKey"],
	);
	return crypto.subtle.deriveKey(
		{
			name: "PBKDF2",
			salt,
			iterations: PBKDF2_ITERATIONS,
			hash: "SHA-256",
		},
		material,
		{ name: "AES-GCM", length: 256 },
		false,
		["encrypt", "decrypt"],
	);
}

function additionalData(roomKey) {
	return encoder.encode(`edgechat:e2ee:v1:${roomKey}`);
}

export async function encryptMessageContent(content, passphrase, roomKey) {
	const crypto = getCrypto();
	if (!crypto) {
		throw new Error("当前浏览器不支持端对端加密");
	}
	const trimmedPassphrase = String(passphrase || "");
	if (!trimmedPassphrase) {
		return content;
	}

	const salt = crypto.getRandomValues(new Uint8Array(16));
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const key = await deriveKey(trimmedPassphrase, salt);
	const ciphertext = await crypto.subtle.encrypt(
		{
			name: "AES-GCM",
			iv,
			additionalData: additionalData(roomKey),
		},
		key,
		encoder.encode(String(content || "")),
	);

	const envelope = {
		v: 1,
		kdf: "PBKDF2-SHA256",
		iter: PBKDF2_ITERATIONS,
		alg: "AES-GCM-256",
		s: toBase64Url(salt),
		iv: toBase64Url(iv),
		ct: toBase64Url(new Uint8Array(ciphertext)),
	};
	return `${ENCRYPTED_MESSAGE_PREFIX}${toBase64Url(encoder.encode(JSON.stringify(envelope)))}`;
}

export async function decryptMessageContent(content, passphrase, roomKey) {
	if (!isEncryptedMessageContent(content)) {
		return { encrypted: false, content };
	}

	const trimmedPassphrase = String(passphrase || "");
	if (!trimmedPassphrase) {
		return { encrypted: true, content: "加密消息：请设置本会话口令后查看", failed: true };
	}

	try {
		const payload = content.slice(ENCRYPTED_MESSAGE_PREFIX.length);
		const envelope = JSON.parse(decoder.decode(fromBase64Url(payload)));
		if (
			envelope?.v !== 1 ||
			envelope?.kdf !== "PBKDF2-SHA256" ||
			envelope?.alg !== "AES-GCM-256"
		) {
			throw new Error("Unsupported encrypted message");
		}

		const salt = fromBase64Url(envelope.s);
		const iv = fromBase64Url(envelope.iv);
		const ciphertext = fromBase64Url(envelope.ct);
		const key = await deriveKey(trimmedPassphrase, salt);
		const plaintext = await getCrypto().subtle.decrypt(
			{
				name: "AES-GCM",
				iv,
				additionalData: additionalData(roomKey),
			},
			key,
			ciphertext,
		);
		return { encrypted: true, content: decoder.decode(plaintext), failed: false };
	} catch {
		return { encrypted: true, content: "加密消息：口令不正确或消息已损坏", failed: true };
	}
}

