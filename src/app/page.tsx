import ScheduleAssignment from "@/components/ScheduleAssignment";
import { getSession } from "@/lib/session";

export default async function Home() {
  const session = await getSession();
  return <ScheduleAssignment session={session} />;
}
