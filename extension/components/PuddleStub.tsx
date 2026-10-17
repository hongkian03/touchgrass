import { Pip } from "./Pip";

type Props = {
  title?: string;
  subtitle?: string;
};

export function PuddleStub({
  title = "Puddle",
  subtitle = "Shell ready.",
}: Props) {
  return (
    <main
      className="min-h-full flex flex-col items-center justify-center gap-3 p-6"
      style={{ background: "var(--pale-sky)", color: "var(--yale-blue)" }}
    >
      <Pip size={112} />
      <h1
        data-testid="puddle-title"
        className="text-3xl font-normal tracking-tight"
        style={{ fontFamily: "Castoro, serif" }}
      >
        {title}
      </h1>
      <p className="text-base opacity-80" style={{ fontFamily: "Castoro, serif" }}>
        {subtitle}
      </p>
    </main>
  );
}
