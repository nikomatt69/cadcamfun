export default function PageStub(props: { legacy: string }) {
  return (
    <div class="p-8 text-slate-600 dark:text-slate-300">
      <p class="text-sm font-mono">Not ported yet: {props.legacy}</p>
    </div>
  )
}
