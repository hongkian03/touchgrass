import { Button } from "../../components/ui/button";

export function DashboardApp() {
  const openFixture = () => {
    void browser.tabs.create({
      url: browser.runtime.getURL("/fixture.html"),
    });
  };

  return (
    <main
      data-testid="dashboard"
      className="mx-auto flex min-h-screen max-w-xl flex-col gap-4 bg-white p-8 font-sans text-foreground"
    >
      <h1
        data-testid="puddle-title"
        className="m-0 text-3xl font-semibold tracking-tight"
      >
        Puddle
      </h1>
      <p className="m-0 text-muted-foreground">
        Week, insights, upload — next. Try Pip on the fixture first.
      </p>
      <Button
        type="button"
        data-testid="try-pip"
        size="lg"
        className="self-start"
        onClick={openFixture}
      >
        Try Pip
      </Button>
    </main>
  );
}
