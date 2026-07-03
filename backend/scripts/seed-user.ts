import bcrypt from 'bcryptjs';
import { connectDatabase, disconnectDatabase } from '../src/db/mongoose.js';
import { UserModel } from '../src/db/models/user.model.js';

const [email, password, name, kindleEmail] = process.argv.slice(2);

if (!email || !password) {
  console.error('Usage: npm run seed:user --workspace backend -- email@example.com "mot-de-passe" "Nom" kindle@example.com');
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
      kindleEmail: kindleEmail?.trim().toLowerCase() || undefined
    }
  },
  { upsert: true, new: true }
);

await disconnectDatabase();
console.log(`Utilisateur ${normalizedEmail} pret.`);
