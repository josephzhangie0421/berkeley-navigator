const ITEMS = [
  { rail: "rail-official", title: "Official information", body: "From university sources such as the course catalog. Numbers link to the source." },
  { rail: "rail-student", title: "Student insights", body: "Informal views from students. Useful, but not verified." },
  { rail: "rail-ai", title: "AI interpretation", body: "Written by the assistant. Not a sourced fact." },
  { rail: "rail-unknown", title: "Other retrieved information", body: "Found in a source whose type isn't labelled. Check the link." },
];

export function ProvenanceLegend() {
  return (
    <section aria-labelledby="legend-heading" className="rounded-lg border border-line bg-surface p-4">
      <h2 id="legend-heading" className="font-serif text-base text-ink">
        Reading an answer
      </h2>
      <ul className="mt-3 space-y-3">
        {ITEMS.map((i) => (
          <li key={i.title} className={`pl-3 ${i.rail}`}>
            <p className="text-sm font-medium text-text">{i.title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted">{i.body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
