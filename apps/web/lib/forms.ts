import { startTransition, type FormEvent } from "react";

/** `<form action>` vacía los campos al terminar, aunque la acción vuelva con un error; enviado así, se conservan. */
export function keepValues(action: (form: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
    startTransition(() => action(form));
  };
}
