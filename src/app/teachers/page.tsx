import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import TeacherManagement from "@/components/TeacherManagement";

export default async function TeachersPage() {
  const session = await getSession();
  if (session?.role !== "admin") {
    redirect("/");
  }

  return <TeacherManagement />;
}
