type StateMessageProps = {
  tone: 'muted' | 'error';
  message: string;
};

export function StateMessage({ tone, message }: StateMessageProps) {
  return <p className={tone}>{message}</p>;
}
