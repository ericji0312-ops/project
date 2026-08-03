import StudentManagement from "@/components/StudentManagement";
import { getSession } from "@/lib/session";

export default async function StudentsPage() {
  const session = await getSession();
  return <StudentManagement session={session} />;
}
