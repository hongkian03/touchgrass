type Props = {
  title?: string;
  subtitle?: string;
};

export function PuddleStub({
  title = "Touchgrass",
  subtitle = "Shell ready.",
}: Props) {
  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-3 bg-white p-6 font-sans text-foreground">
      <h1
        data-testid="puddle-title"
        className="text-3xl font-semibold tracking-tight"
      >
        {title}
      </h1>
      <p className="text-base text-muted-foreground">{subtitle}</p>
    </main>
  );
}
