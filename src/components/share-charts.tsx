"use client";

import { motion } from "motion/react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatInrFromPaise, formatPercentHundredths } from "@/lib/ledger-math";
import type { ShareRow } from "@/lib/ledger-math";
import type { PersonRecord } from "@/lib/records";

function rows(people: PersonRecord[], shares: ShareRow[]) {
  return shares
    .map((share) => {
      const person = people.find((item) => item.id === share.personId);
      return {
        id: share.personId,
        name: person?.name.split(" ")[0] ?? share.personId,
        fullName: person?.name ?? share.personId,
        color: person?.color ?? "#94A3B8",
        role: share.role,
        amountPaise: share.amountPaise,
        percentHundredths: share.percentHundredths,
      };
    })
    .filter((row) => row.amountPaise > 0 || row.role === "contributor");
}

export function ShareCharts({ people, shares }: { people: PersonRecord[]; shares: ShareRow[] }) {
  const data = rows(people, shares);
  const ownership = data.filter((row) => row.role === "contributor" && row.percentHundredths > 0);
  const paid = data.filter((row) => row.amountPaise > 0);

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <section className="tile p-4">
        <h2 className="font-heading text-lg">Ownership</h2>
        <p className="text-muted-foreground mb-3 text-sm">Contributor payments only. The homeowner is not in this pie.</p>
        {ownership.length === 0 ? (
          <p className="text-muted-foreground grid h-56 place-items-center text-center text-sm">
            No contributor payments yet, so every share is 0%.
          </p>
        ) : (
          <motion.div
            className="h-64"
            initial={{ rotate: -120, scale: 0.6, opacity: 0 }}
            whileInView={{ rotate: 0, scale: 1, opacity: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ type: "spring", stiffness: 110, damping: 14 }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={ownership} dataKey="percentHundredths" nameKey="fullName" innerRadius={52} outerRadius={84} isAnimationActive animationDuration={1100} animationBegin={200} animationEasing="ease-out" stroke="#ffffff" strokeWidth={2}>
                  {ownership.map((entry) => (
                    <Cell key={entry.id} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatPercentHundredths(Number(value ?? 0))}
                />
              </PieChart>
            </ResponsiveContainer>
          </motion.div>
        )}
      </section>
      <section className="tile p-4">
        <h2 className="font-heading text-lg">Amount paid</h2>
        <p className="text-muted-foreground mb-3 text-sm">Everyone&apos;s payments, including the homeowner.</p>
        {paid.length === 0 ? (
          <p className="text-muted-foreground grid h-56 place-items-center text-center text-sm">
            Payments will stack up here as each person records their own.
          </p>
        ) : (
          <motion.div
            className="h-64 origin-bottom"
            initial={{ scaleY: 0.2, opacity: 0 }}
            whileInView={{ scaleY: 1, opacity: 1 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ type: "spring", stiffness: 140, damping: 13 }}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={paid} margin={{ left: 8, right: 8, top: 8 }}>
                <XAxis dataKey="name" tickLine={false} axisLine={false} tick={{ fill: "#5a6478", fontSize: 12 }} />
                <YAxis hide />
                <Tooltip formatter={(value) => formatInrFromPaise(Number(value ?? 0))} />
                <Bar dataKey="amountPaise" radius={8} isAnimationActive animationDuration={1100} animationBegin={200} animationEasing="ease-out">
                  {paid.map((entry) => (
                    <Cell key={entry.id} fill={entry.color} fillOpacity={1} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </motion.div>
        )}
      </section>
    </div>
  );
}
