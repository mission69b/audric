import { redirect } from "next/navigation";

// The directory moved to the root (2026-07-16: the directory IS the
// homepage). Permanent alias so old links keep working.
export default function DirectoryAlias() {
  redirect("/");
}
