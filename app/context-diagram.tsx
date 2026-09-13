"use client";

import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  BriefcaseBusiness,
  CircleDollarSign,
  ClipboardCheck,
  Landmark,
  UsersRound,
  Wrench,
  type LucideIcon,
} from "lucide-react";

type Stage = {
  number: string;
  title: string;
  subtitle: string;
  status: "Live" | "Partial" | "Planned";
  target?: string;
  icon: LucideIcon;
  items: string[];
  gaps: string[];
};

const stages: Stage[] = [
  {
    number: "1",
    title: "Pre-Sales / Bid",
    subtitle: "Bid Staff",
    status: "Planned",
    icon: BriefcaseBusiness,
    items: [
      "Accreditation requirements",
      "Client profile and contacts",
      "TOR and bid bulletin",
      "Bidding and legal documents",
      "Post-qualification and NOA requirements",
    ],
    gaps: ["CRM form and tools", "NOA/NTP monitoring"],
  },
  {
    number: "2",
    title: "Tech / Engineering",
    subtitle: "PMQA and Field",
    status: "Partial",
    target: "plan",
    icon: Wrench,
    items: [
      "Review specifications and material requests",
      "Deployment and project plans",
      "Materials and field-worker checklist",
      "Manual monitoring sheet",
      "Completion and acceptance certificate",
    ],
    gaps: ["Standard DP/PM forms", "Digital completion monitoring"],
  },
  {
    number: "3",
    title: "Purchasing / Inventory",
    subtitle: "Materials and Delivery",
    status: "Partial",
    target: "procurement",
    icon: Boxes,
    items: [
      "Material request and canvass reference",
      "Document approval and budget request",
      "Purchase order and supplier list",
      "Supplier DR, receipt and inventory update",
      "Customer delivery and signed DR",
    ],
    gaps: ["Supplier accreditation", "Operational purchasing workflow"],
  },
  {
    number: "4",
    title: "Accounts Receivable",
    subtitle: "Billing and Collection",
    status: "Live",
    target: "ar-monitor",
    icon: CircleDollarSign,
    items: [
      "Completed-project notification",
      "COC review and billing documents",
      "Daily AR monitoring",
      "Payment and OR ledger",
      "Aging, collection and exception reporting",
    ],
    gaps: ["Connection to customer/project master"],
  },
  {
    number: "5",
    title: "Accounts Payable",
    subtitle: "Supplier Payments",
    status: "Partial",
    target: "finance",
    icon: Landmark,
    items: [
      "PO and budget request",
      "Supplier updates and bills",
      "Allowances and payments",
      "AP monitoring",
    ],
    gaps: ["Supplier payment ledger", "Automated AP controls"],
  },
];

export default function ContextDiagram({
  onNavigate,
}: {
  onNavigate: (page: string) => void;
}) {
  return (
    <section className="context-page">
      <div className="context-intro">
        <div>
          <small>MODULE 0 · PROCESS BLUEPRINT</small>
          <h2>Customer interactions by Unicenter</h2>
          <p>
            One customer and project record will connect every document,
            activity, approval, billing and payment from bid to completion.
          </p>
        </div>
        <div className="context-legend">
          <span>
            <i className="live" /> Live
          </span>
          <span>
            <i className="partial" /> Partial
          </span>
          <span>
            <i className="planned" /> Planned
          </span>
        </div>
      </div>

      <div className="context-flow">
        <div className="customer-hub">
          <UsersRound />
          <small>CENTRAL RECORD</small>
          <strong>Customer & Project</strong>
          <span>Planned under Module 1</span>
        </div>

        <div className="context-stages">
          {stages.map((stage) => {
            const Icon = stage.icon;
            return (
              <article
                key={stage.number}
                className={`context-card ${stage.status.toLowerCase()}`}
              >
                <div className="context-card-head">
                  <span className="context-number">{stage.number}</span>
                  <Icon />
                  <div>
                    <h3>{stage.title}</h3>
                    <small>{stage.subtitle}</small>
                  </div>
                  <b>{stage.status}</b>
                </div>
                <div className="context-card-body">
                  <div>
                    <h4>
                      <ClipboardCheck /> Activities and documents
                    </h4>
                    <ul>
                      {stage.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="context-gaps">
                    <h4>Control gaps to build</h4>
                    <ul>
                      {stage.gaps.map((gap) => (
                        <li key={gap}>{gap}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                {stage.target ? (
                  <button onClick={() => onNavigate(stage.target!)}>
                    Open current module <ArrowRight />
                  </button>
                ) : (
                  <div className="context-planned">
                    <BadgeCheck /> Next module to build
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
