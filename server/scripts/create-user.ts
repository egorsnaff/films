import bcrypt from "bcryptjs";

import { createUser, findUserByUsername } from "../src/db.js";

const username = process.argv[2]?.trim();
const password = process.argv[3];

if (!username || !password) {
  console.error("Usage: npm run create-user -- <username> <password>");
  process.exit(1);
}

if (findUserByUsername(username)) {
  console.error(`User "${username}" already exists`);
  process.exit(1);
}

const passwordHash = bcrypt.hashSync(password, 12);
const user = createUser(username, passwordHash);

console.log(`Created user #${user.id}: ${user.username}`);
