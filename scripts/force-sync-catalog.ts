import * as admin from 'firebase-admin';
import * as fs from 'fs';

// Initialize Firebase Admin
admin.initializeApp({
  credential: admin.credential.cert(require('../serviceAccount.json')),
});

const db = admin.firestore();

async function run() {
  const companies = await db.collection('companies').get();
  for (const doc of companies.docs) {
    const data = doc.data();
    const mk = data.marketplace;
    if (mk && mk.enabled && mk.slug) {
      const slug = mk.slug;
      console.log(`Syncing public-catalogs/${slug} ...`);
      await db.doc(`public-catalogs/${slug}`).set({
        phone: mk.phone || null,
        email: mk.email || null,
        instagram: mk.instagram || null,
        facebook: mk.facebook || null,
        tiktok: mk.tiktok || null,
        locationText: mk.locationText || null,
        locationUrl: mk.locationUrl || null,
      }, { merge: true });
      console.log(`Done syncing ${slug}`);
    }
  }
}

run().catch(console.error);
