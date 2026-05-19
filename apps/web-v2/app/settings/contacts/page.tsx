"use client";

import { useZkLogin } from "@/components/auth/use-zklogin";
import { ContactsSection } from "@/components/settings/contacts-section";

export default function ContactsPage() {
  const { address } = useZkLogin();
  return <ContactsSection address={address} />;
}
