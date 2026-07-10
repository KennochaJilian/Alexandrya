import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase } from '../db/mongoose.js';
import { UserModel } from '../db/models/user.model.js';

const [email, password, name, kindleEmail, role] = process.argv.slice(2);

if (!email || !password) {
  console.error('Usage: node dist/cli/seed-user.js email@example.com "mot-de-passe" "Nom" kindle@example.com user|admin');
  process.exit(1);
}

if (role && !['user', 'admin'].includes(role)) {
  console.error('Role invalide. Valeurs possibles: user ou admin.');
  process.exit(1);
}

await connectDatabase();

const passwordHash = await bcrypt.hash(password, 12);
const normalizedEmail = email.trim().toLowerCase();

await UserModel.findOneAndUpdate(
  { email: normalizedEmail },
  {
    $set: {
      email: normalizedEmail,
      passwordHash,
      name: name?.trim() || undefined,
      kindleEmail: kindleEmail?.trim().toLowerCase() || undefined,
      role: role ?? 'user'
    }
  },
  { upsert: true, new: true }
);

await disconnectDatabase();
console.log(`Utilisateur ${normalizedEmail} pret.`);
