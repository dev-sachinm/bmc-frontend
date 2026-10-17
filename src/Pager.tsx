type PagerProps = {
  page: number;
  total: number;
  page_size: number;
  onPage: (page: number) => void;
};

export function Pager({ page, total, page_size, onPage }: PagerProps) {
  const totalPages = Math.max(1, Math.ceil(total / page_size));
  if (totalPages <= 1) return null;

  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-sm text-stone-600">
      <button
        type="button"
        className="min-h-9 rounded-xl bg-white px-4 font-medium ring-1 ring-stone-200 disabled:opacity-40 hover:bg-stone-50"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        Previous
      </button>
      <span className="text-xs text-stone-500">
        Page {page} of {totalPages}
      </span>
      <button
        type="button"
        className="min-h-9 rounded-xl bg-white px-4 font-medium ring-1 ring-stone-200 disabled:opacity-40 hover:bg-stone-50"
        disabled={page >= totalPages}
        onClick={() => onPage(page + 1)}
      >
        Next
      </button>
    </div>
  );
}
