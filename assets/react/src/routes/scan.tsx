import { createFileRoute } from "@tanstack/react-router"
import { ScanPage } from "../pages/scan"

export const Route = createFileRoute("/scan")({
  staticData: { title: "Scan" },
  component: ScanPage,
})
