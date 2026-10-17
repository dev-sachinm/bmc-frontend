import { useLocation, useNavigate } from "react-router-dom";

export function ContentBack() {
  const navigate = useNavigate();
  const location = useLocation();

  function goBack() {
    if (location.key !== "default") {
      navigate(-1);
      return;
    }
    navigate("/");
  }

  return (
    <button
      type="button"
      className="-ml-2 mb-3 inline-flex min-h-10 items-center gap-1 rounded-xl px-2 text-sm font-semibold text-[#1f4d42]"
      onClick={goBack}
    >
      <span aria-hidden="true">←</span>
      Back
    </button>
  );
}
