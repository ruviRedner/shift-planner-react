import { useEffect, useState } from "react";
import { Alert, Button, Spin } from "antd";
import Planner from "../App";
import type { PlannerRepository } from "../storage/repository";
import { connectTeamRepository } from "./remoteRepository";

export function PublicPlanner() {
  const [repository, setRepository] = useState<PlannerRepository | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setError("");
    void connectTeamRepository().then((repo) => { if (active) setRepository(repo); })
      .catch((err: Error) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [attempt]);
  if (error) return <Alert type="error" showIcon title="לא ניתן לטעון את הסידור" description={error}
    action={<Button onClick={() => setAttempt((value) => value + 1)}>נסה שוב</Button>} />;
  if (!repository) return <Spin />;
  return <Planner repository={repository} />;
}
