const fs = require('fs').promises;
const path = require('path');

async function initAccessCodes() {
  const dataDir = path.join(__dirname, '..', 'data');
  const codesFile = path.join(dataDir, 'access_codes.json');

  try {
    // Create data directory if it doesn't exist
    await fs.mkdir(dataDir, { recursive: true });

    // Default access codes
    const defaultCodes = {
      "DEMO2025": {
        "description": "Code de démonstration",
        "createdAt": new Date().toISOString(),
        "expiresAt": null,
        "usedBy": []
      },
      "TESTCODE": {
        "description": "Code de test",
        "createdAt": new Date().toISOString(),
        "expiresAt": null,
        "usedBy": []
      }
    };

    // Check if file already exists
    try {
      await fs.access(codesFile);
      console.log('⚠️  Le fichier access_codes.json existe déjà.');
      console.log('   Supprimez-le si vous voulez le réinitialiser.\n');
      
      // Show existing codes
      const existing = JSON.parse(await fs.readFile(codesFile, 'utf-8'));
      console.log('📋 Codes existants:');
      Object.keys(existing).forEach(code => {
        console.log(`   - ${code}: ${existing[code].description}`);
      });
      return;
    } catch (err) {
      // File doesn't exist, create it
      await fs.writeFile(codesFile, JSON.stringify(defaultCodes, null, 2), 'utf-8');
      
      console.log('✅ Fichier access_codes.json créé avec succès!\n');
      console.log('📋 Codes d\'accès disponibles:');
      Object.keys(defaultCodes).forEach(code => {
        console.log(`   - ${code}: ${defaultCodes[code].description}`);
      });
      console.log('\n💡 Vous pouvez modifier ce fichier pour ajouter/supprimer des codes.\n');
    }

  } catch (err) {
    console.error('❌ Erreur:', err.message);
    process.exit(1);
  }
}

initAccessCodes();
