/* Prints a new key pair for push notifications. Run once, keep the values, never change them
 * afterwards (devices that subscribed with the former public key would stop receiving).
 *   node scripts/generate-vapid.js
 */
const { generateKeyPairSync } = require('crypto');

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
const jwk = privateKey.export({ format: 'jwk' });
const point = Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]);
console.log(`VAPID_PUBLIC_KEY=${point.toString('base64url')}`);
console.log(`VAPID_PRIVATE_KEY=${jwk.d}`);
