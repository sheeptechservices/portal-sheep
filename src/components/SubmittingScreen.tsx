export default function SubmittingScreen() {
  return (
    <div className="submitting-screen">
      <div className="submitting-icon-wrap">
        <div className="submitting-spinner" />
        <div className="submitting-inner-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      </div>
      <h2 className="submitting-title">
        Enviando
        <span className="submitting-dots">
          <span>.</span><span>.</span><span>.</span>
        </span>
      </h2>
      <p className="submitting-sub">Registrando seu lead, aguarde um momento.</p>
    </div>
  );
}
