/**
 * Staff account recovery, run where the database is reachable (your laptop with
 * apps/api/.env pointing at the live database, for example).
 *
 *   pnpm --filter api admin:user list
 *   pnpm --filter api admin:user reset <email>            # asks for a new password
 *   pnpm --filter api admin:user create <email> <owner|support|finance>   (owner = Global Admin) "Full Name"
 *   pnpm --filter api admin:user sql <email> "Full Name"   # prints an INSERT for the first Global Admin
 *
 * `sql` is for creating the FIRST Global Admin straight in Supabase: it asks for a
 * password, hashes it here, and prints one INSERT to paste into the Supabase SQL
 * editor. Nothing is written to the database by this command, and the password
 * itself never leaves your computer.
 *
 * Use `reset` when the only Global Admin has forgotten their password. It also signs
 * that person out everywhere. The password is asked for in the terminal so it
 * never lands in your shell history.
 */
import "dotenv/config";
import readline from "node:readline";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db } from "../src/db/client";
import { adminUsers } from "../src/db/schema";
import { createStaff, passwordSchema, resetStaffPassword } from "../src/lib/admin-auth";

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (a) => { rl.close(); resolve(a); }));
}

async function main() {
  const [cmd, email, role, ...nameParts] = process.argv.slice(2);
  if (cmd === "list") {
    const list = await db.select().from(adminUsers);
    for (const a of list) console.log(`${a.email}\t${a.role}\t${a.disabledAt ? "disabled" : "active"}\t${a.fullName}`);
    if (!list.length) console.log('No staff accounts yet. Create the first Global Admin with: admin:user sql <email> "Full Name"');
    return;
  }
  if (cmd === "reset" && email) {
    const [row] = await db.select().from(adminUsers).where(eq(adminUsers.email, email.toLowerCase())).limit(1);
    if (!row) throw new Error(`No staff account with email ${email}`);
    const password = passwordSchema.parse(await ask("New password (10+ characters, letters and a number): "));
    await resetStaffPassword(row.id, password);
    if (row.disabledAt) await db.update(adminUsers).set({ disabledAt: null }).where(eq(adminUsers.id, row.id));
    console.log(`Password reset for ${row.email}. They are signed out everywhere${row.disabledAt ? " and the account is active again" : ""}.`);
    return;
  }
  if (cmd === "sql" && email && role) {
    const fullName = [role, ...nameParts].join(" ");
    const password = passwordSchema.parse(await ask("Password for the Global Admin (10+ characters, letters and a number): "));
    const hash = await bcrypt.hash(password, 12);
    const q = (v: string) => `'${v.replace(/'/g, "''")}'`;
    console.log("\nPaste this into the Supabase SQL editor and run it:\n");
    console.log(
      `INSERT INTO admin_users (email, full_name, role, password_hash)\nVALUES (${q(email.toLowerCase())}, ${q(fullName)}, 'owner', ${q(hash)});\n`
    );
    return;
  }
  if (cmd === "create" && email && (role === "owner" || role === "support" || role === "finance") && nameParts.length) {
    const password = passwordSchema.parse(await ask("Password for the new account (10+ characters, letters and a number): "));
    const member = await createStaff({ email: email.toLowerCase(), role, fullName: nameParts.join(" "), password });
    console.log(`Created ${member.email} as ${member.role}.`);
    return;
  }
  console.log('Usage:\n  admin:user list\n  admin:user sql <email> "Full Name"   (first Global Admin, via the Supabase SQL editor)\n  admin:user reset <email>\n  admin:user create <email> <owner|support|finance>   (owner = Global Admin) "Full Name"');
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => process.exit());
