import { ButtonLink, Card, Icon } from "@/components/ui";

export default function NotFound() {
  return (
    <Card className="mx-auto mt-16 max-w-lg text-center">
      <Icon name="search" className="mx-auto h-8 w-8 text-ink-400" />
      <h1 className="mt-3 text-[20px] font-bold text-ink-950">Record not found</h1>
      <p className="mt-1.5 text-[14px] text-ink-600">
        This record does not exist, or your roles do not permit you to view it.
      </p>
      <div className="mt-5">
        <ButtonLink href="/" variant="primary">Return to dashboard</ButtonLink>
      </div>
    </Card>
  );
}
