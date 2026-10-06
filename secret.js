/*
 * translate-assistant@atareao.es
 *
 * Stores the DeepL API key in the user's keyring (libsecret) instead of
 * GSettings, where any process could read it in plain text. Shared by the
 * shell extension and the preferences process.
 */

import Secret from 'gi://Secret?version=1';

const SCHEMA = new Secret.Schema(
    'es.atareao.translate-assistant',
    Secret.SchemaFlags.NONE,
    {service: Secret.SchemaAttributeType.STRING});
const ATTRIBUTES = {service: 'deepl'};
const LABEL = 'Translate Assistant: DeepL API key';

export function lookupApiKey() {
    return new Promise((resolve, reject) => {
        Secret.password_lookup(SCHEMA, ATTRIBUTES, null, (_source, result) => {
            try {
                resolve(Secret.password_lookup_finish(result));
            } catch (e) {
                reject(e);
            }
        });
    });
}

export function storeApiKey(apikey) {
    if (!apikey)
        return clearApiKey();
    return new Promise((resolve, reject) => {
        Secret.password_store(SCHEMA, ATTRIBUTES, Secret.COLLECTION_DEFAULT,
            LABEL, apikey, null, (_source, result) => {
                try {
                    resolve(Secret.password_store_finish(result));
                } catch (e) {
                    reject(e);
                }
            });
    });
}

export function clearApiKey() {
    return new Promise((resolve, reject) => {
        Secret.password_clear(SCHEMA, ATTRIBUTES, null, (_source, result) => {
            try {
                resolve(Secret.password_clear_finish(result));
            } catch (e) {
                reject(e);
            }
        });
    });
}

/**
 * Move a key left in the legacy plain-text GSettings key into the keyring,
 * and wipe the GSettings copy once the keyring holds it.
 */
export async function migrateApiKey(settings) {
    const legacy = settings.get_string('apikey');
    if (!legacy)
        return;
    await storeApiKey(legacy);
    settings.set_string('apikey', '');
}
