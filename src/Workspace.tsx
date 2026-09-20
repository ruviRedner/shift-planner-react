import { lazy, Suspense, useEffect, useState } from "react";
import { Button, Spin } from "antd";
import Planner from "./App";
import { browserRepository } from "./storage/repository";

const TeamPortal = lazy(() => import("./team/TeamPortal").then((module) => ({ default: module.TeamPortal })));
const PublicPlanner = lazy(() => import("./team/PublicPlanner").then((module) => ({ default: module.PublicPlanner })));
export function Workspace() {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => { const update = () => setHash(window.location.hash); window.addEventListener("hashchange", update); return () => window.removeEventListener("hashchange", update); }, []);
  if (import.meta.env.VITE_PUBLIC_EDITING === "true") return <Suspense fallback={<Spin />}><PublicPlanner /></Suspense>;
  if (import.meta.env.VITE_SHARED_ONLY === "true" || hash.startsWith("#/team") || hash.startsWith("#/join")) return <Suspense fallback={<Spin />}><TeamPortal /></Suspense>;
  return <><div className="workspace-switch no-print"><Button onClick={() => { window.location.hash = "/team"; }}>אזור הצוות · כניסה לחשבון</Button></div><Planner repository={browserRepository} /></>;
}
