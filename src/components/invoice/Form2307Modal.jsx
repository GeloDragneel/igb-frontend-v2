// BIR 2307 preview (old modal_PrintPDF): loads the PDF from the API and shows it in an iframe
import { useEffect, useState } from "react";
import Modal from "../Modal";
import { apiBlob } from "../../context/AuthContext";
import "./invoiceExtras.css";

/** type = "sales" | "purchases" | "expenses" */
export default function Form2307Modal({ type = "sales", invoiceNo, onClose }) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    let objectUrl = "";
    apiBlob(`/${type}/invoice/${encodeURIComponent(invoiceNo)}/2307`)
      .then((blob) => {
        if (!alive) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((e) => alive && setError(e.message || "Couldn't create the 2307."));
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [type, invoiceNo]);

  return (
    <Modal
      title="Print Preview · BIR 2307"
      onClose={onClose}
      size="lg"
      footer={
        <>
          {url && <a className="btn" href={url} download={`2307-${invoiceNo}.pdf`}>Download</a>}
          <button className="btn btn-dark" onClick={onClose}>Close</button>
        </>
      }
    >
      {error && <div className="alert-error" role="alert">{error}</div>}
      {!url && !error && <div className="pdf-loading">Preparing the 2307…</div>}
      {url && <iframe className="pdf-frame" src={url} title={`BIR 2307 ${invoiceNo}`} />}
    </Modal>
  );
}
