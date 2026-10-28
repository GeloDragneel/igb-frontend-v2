import { createContext, useContext } from "react";
import { partsToIso, isoToParts, p, f } from "./birForms";

export const BirCtx = createContext(null);
const useB = () => useContext(BirCtx);

const Q4 = ["1ST", "2ND", "3RD", "4TH"];
const YN = ["YES", "NO"];
const TREATY = [
    { value: "", label: "" },
    { value: "special_rate", label: "SPECIAL RATE" },
    { value: "tax_treaty", label: "INTERNATIONAL TAX TREATY" },
];
const DECL_FORM = "I/WE DECLARE UNDER THE PENALTIES OF PERJURY THAT THIS REMITTANCE FORM HAS BEEN MADE IN GOOD FAITH, VERIFIED BY ME/US, AND TO THE BEST OF MY/OUR KNOWLEDGE AND BELIEF, IS TRUE AND CORRECT, PURSUANT TO THE PROVISIONS OF THE NATIONAL INTERNAL REVENUE CODE, AS AMENDED, AND THE REGULATIONS ISSUED UNDER AUTHORITY THEREOF. FURTHER, I/WE GIVE MY/OUR CONSENT TO THE PROCESSING OF MY/OUR INFORMATION AS CONTEMPLATED UNDER THE *DATA PRIVACY ACT OF 2012 (R.A. NO. 10173) FOR LEGITIMATE AND LAWFUL PURPOSES. (IF AUTHORIZED REPRESENTATIVE, ATTACH AUTHORIZATION LETTER)";
const DECL_RETURN = "I/WE DECLARE UNDER THE PENALTIES OF PERJURY THAT THIS REMITTANCE RETURN, AND ALL ITS ATTACHMENTS, HAVE BEEN MADE IN GOOD FAITH, VERIFIED BY ME/US, AND TO THE BEST OF MY/OUR KNOWLEDGE AND BELIEF, IS TRUE AND CORRECT, PURSUANT TO THE PROVISIONS OF THE NATIONAL INTERNAL REVENUE CODE, AS AMENDED, AND THE REGULATIONS ISSUED UNDER AUTHORITY THEREOF. FURTHER, I GIVE MY CONSENT TO THE PROCESSING OF MY INFORMATION AS CONTEMPLATED UNDER THE *DATA PRIVACY ACT OF 2012 (R.A. NO. 10173) FOR LEGITIMATE AND LAWFUL PURPOSES. (IF AUTHORIZED REPRESENTATIVE, ATTACH AUTHORIZATION LETTER)";
const NOTE_A = "NOTE: *PLEASE READ THE BIR DATA PRIVACY POLICY FOUND IN THE BIR WEBSITE (WWW.BIR.GOV.PH)";
const NOTE_B = "NOTE: THE BIR DATA PRIVACY POLICY IS IN THE BIR WEBSITE (WWW.BIR.GOV.PH)";

/* =========================================================
   bound inputs (each one is tied to an eBIRForms key)
   ========================================================= */
function Txt({ k, ro, c, r }) {
    const { vals, apply } = useB();
    return (
        <input
            className={`input bf-in ${c ? "ta-center" : ""} ${r ? "ta-right" : ""}`}
            readOnly={ro}
            tabIndex={ro ? -1 : undefined}
            value={vals[k] ?? ""}
            onChange={(e) => apply({ [k]: e.target.value })}
        />
    );
}

function Num({ k, ro, blank }) {
    const { vals, apply } = useB();
    return (
        <input
            className="input bf-in ta-right mono"
            readOnly={ro}
            tabIndex={ro ? -1 : undefined}
            inputMode="decimal"
            placeholder={blank === "" ? "" : "0.00"}
            value={vals[k] ?? ""}
            onChange={(e) => apply({ [k]: e.target.value })}
            onBlur={(e) => { if (!ro && e.target.value.trim() !== "") apply({ [k]: f(p(e.target.value)) }); }}
        />
    );
}

// shown like the old popup, but not part of the save file
function Free({ ro }) {
    return <input className="input bf-in" readOnly={ro} tabIndex={ro ? -1 : undefined} />;
}

const fld = (k, opts = {}) => (k ? <Txt k={k} {...opts} /> : <Free />);

function Opts({ group, labels, stack }) {
    const { vals, apply } = useB();
    return (
        <div className={stack ? "bf-stack" : "bf-opts"} role="radiogroup">
            {group.map((k, i) => (
                <label key={k} className="bf-opt">
                    <input
                        type="radio"
                        checked={vals[k] === "true"}
                        onChange={() => apply(Object.fromEntries(group.map((x) => [x, x === k ? "true" : "false"])))}
                    />
                    {labels[i]}
                </label>
            ))}
        </div>
    );
}

function Chk({ k, label }) {
    const { vals, apply } = useB();
    return (
        <label className="bf-opt bf-wrap-text">
            <input type="checkbox" checked={vals[k] === "true"} onChange={(e) => apply({ [k]: e.target.checked ? "true" : "false" })} />
            {label}
        </label>
    );
}

function DateF({ parts, ro }) {
    const { vals, apply } = useB();
    return (
        <input
            type="date"
            className="input bf-in ta-center"
            readOnly={ro}
            tabIndex={ro ? -1 : undefined}
            value={partsToIso(parts, vals)}
            onChange={(e) => apply(isoToParts(parts, e.target.value))}
        />
    );
}

function MonthF({ parts }) {
    const { vals, apply } = useB();
    return (
        <input
            type="month"
            className="input bf-in"
            value={partsToIso(parts, vals, "month")}
            onChange={(e) => apply(isoToParts(parts, e.target.value))}
        />
    );
}

function Sel({ k, options }) {
    const { vals, apply } = useB();
    return (
        <select className="input bf-in" value={vals[k] ?? ""} onChange={(e) => apply({ [k]: e.target.value })}>
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
    );
}

const No = ({ n }) => <span className="bf-no">{n}</span>;
const T = ({ children, cls = "" }) => <table className={`bf-table ${cls}`}><tbody>{children}</tbody></table>;
const H = ({ children, span }) => <tr className="bf-h"><td colSpan={span}>{children}</td></tr>;
const Tin = ({ keys }) => <div className="bf-tin">{keys.map((k) => <Txt key={k} k={k} ro c />)}</div>;
const Cell = ({ children }) => <div className="bf-cell">{children}</div>;

/* ---------- shared blocks ---------- */
function Declaration({ text = DECL_FORM, agent, issue, expiry }) {
    return (
        <>
            <T><tr><td className="bf-wrap-text bf-sm">{text}</td></tr></T>
            <T>
                <tr><td colSpan={3}>FOR INDIVIDUAL:</td><td colSpan={3}>FOR NON-INDIVIDUAL:</td></tr>
                <tr>
                    <td colSpan={3}><textarea className="input bf-sig" rows={3} disabled /></td>
                    <td colSpan={3}><textarea className="input bf-sig" rows={3} disabled /></td>
                </tr>
                <tr>
                    <td colSpan={3} className="bf-c bf-wrap-text bf-sm">SIGNATURE OVER PRINTED NAME OF TAXPAYER/AUTHORIZED REPRESENTATIVE/TAX AGENT (INDICATE TITLE/DESIGNATION AND TIN)</td>
                    <td colSpan={3} className="bf-c bf-wrap-text bf-sm">SIGNATURE OVER PRINTED NAME OF PRESIDENT/VICE PRESIDENT/AUTHORIZED OFFICER OR REPRESENTATIVE/TAX AGENT (INDICATE TITLE/DESIGNATION AND TIN)</td>
                </tr>
                <tr>
                    <td colSpan={3}>
                        <Cell><span className="bf-sm bf-wrap-text bf-lbl">TAX AGENT ACCREDITATION NO./ ATTORNEY'S ROLL NO. (IF APPLICABLE)</span>{fld(agent)}</Cell>
                    </td>
                    <td colSpan={3}>
                        <Cell>
                            <span className="bf-sm bf-lbl">DATE OF ISSUE (MM/DD/YYYY)</span>{fld(issue)}
                            <span className="bf-sm bf-lbl">DATE OF EXPIRY (MM/DD/YYYY)</span>{fld(expiry)}
                        </Cell>
                    </td>
                </tr>
            </T>
        </>
    );
}

const payKeys = (pre, n, noAgency) => ({
    a: noAgency ? null : `${pre}txtAgency${n}`, n: `${pre}txtNumber${n}`, d: `${pre}txtDate${n}`, m: `${pre}txtAmount${n}`,
});

// rows: [[itemNo, label, keys|null]]; other: [itemNo, keys|null (with p = particular)]
function Payment({ rows, other }) {
    const [otherNo, ok] = other;
    return (
        <T>
            <H span={5}>PART III - DETAILS OF PAYMENT</H>
            <tr className="bf-c"><td>PARTICULARS</td><td>DRAWEE BANK / AGENCY</td><td>NUMBER</td><td>DATE (MM/DD/YYYY)</td><td>AMOUNT</td></tr>
            {rows.map(([no, label, k]) => (
                <tr key={no}>
                    <td><No n={no} />{label}</td>
                    <td>{fld(k?.a)}</td><td>{fld(k?.n)}</td><td>{fld(k?.d)}</td><td>{fld(k?.m)}</td>
                </tr>
            ))}
            <tr><td colSpan={5}><No n={otherNo} />OTHERS (SPECIFY BELOW)</td></tr>
            <tr>
                <td>{fld(ok?.p)}</td><td>{fld(ok?.a)}</td><td>{fld(ok?.n)}</td><td>{fld(ok?.d)}</td><td>{fld(ok?.m)}</td>
            </tr>
        </T>
    );
}

function Note({ text = NOTE_A }) {
    return (
        <T>
            <tr>
                <td className="bf-c bf-wrap-text bf-sm">MACHINE VALIDATION/REVENUE OFFICIAL RECEIPT DETAILS<br />(IF NOT FILED WITH AN AUTHORIZED AGENT BANK)</td>
                <td className="bf-c bf-wrap-text bf-sm">STAMP OF RECEIVING OFFICE/AAB AND DATE OF RECEIPT<br />(RO'S SIGNATURE/BANK TELLER'S INITIAL)</td>
            </tr>
            <tr><td colSpan={2} className="bf-wrap-text bf-sm">{text}</td></tr>
        </T>
    );
}

// label | item no | amount   (one row of a Part II list)
function Line({ no, label, k, ro, other, wrap }) {
    return (
        <tr>
            <td className={wrap ? "bf-wrap-text" : ""}>
                {other ? <Cell><No n={no} /><span>{label}</span>{fld(other)}</Cell> : <><No n={no} />{label}</>}
            </td>
            <td className="bf-r bf-w4"><No n={no} /></td>
            <td className="bf-w15"><Num k={k} ro={ro} /></td>
        </tr>
    );
}

// Penalties: SURCHARGE | INTEREST | COMPROMISE | TOTAL (4 boxes on one row)
function Penalties({ nos, keys }) {
    return (
        <T>
            <tr className="bf-c"><td colSpan={2}>SURCHARGE</td><td colSpan={2}>INTEREST</td><td colSpan={2}>COMPROMISE</td><td colSpan={2}>&nbsp;</td></tr>
            <tr>
                {keys.map((k, i) => [
                    <td key={`n${i}`} className="bf-c bf-w4"><No n={nos[i]} /></td>,
                    <td key={`v${i}`}><Num k={k} ro={i === 3} /></td>,
                ])}
            </tr>
        </T>
    );
}

/* =========================================================
   0605
   ========================================================= */
const A = "frm0605:";
function L0605() {
    return (
        <>
            <T>
                <tr>
                    <td><Cell><No n="1" />FOR THE<Opts group={[`${A}itemFiscalStartMonth:_1`, `${A}itemFiscalStartMonth:_2`]} labels={["CALENDAR", "FISCAL"]} /></Cell></td>
                    <td colSpan={4} />
                </tr>
                <tr>
                    <td><No n="2" />YEAR ENDED (MM/YYYY)</td><td><No n="3" />QUARTER</td><td><No n="4" />DUE DATE (MM/DD/YYYY)</td>
                    <td><No n="5" />NO OF SHEET ATTACHMENT</td><td><No n="6" />ATC</td>
                </tr>
                <tr>
                    <td><MonthF parts={[[`${A}itemYearEndMonth`, "m"], [`${A}txtYearEnded`, "y"]]} /></td>
                    <td><Opts group={["itemQuarter_1", "itemQuarter_2", "itemQuarter_3", "itemQuarter_4"]} labels={Q4} /></td>
                    <td><DateF parts={[[`${A}txtDueDateMonth`, "m"], [`${A}txtDueDateDay`, "d"], [`${A}txtDueDateYear`, "y"]]} /></td>
                    <td><Txt k={`${A}txtNoOfSheets`} /></td>
                    <td><Txt k="0605txtATCCode" /></td>
                </tr>
            </T>
            <T>
                <tr>
                    <td className="bf-w20"><No n="7" />RETURN PERIOD (MM/YYYY)</td>
                    <td className="bf-w30"><DateF parts={[[`${A}txtReturnPeriodMonth`, "m"], [`${A}txtReturnPeriodDay`, "d"], [`${A}txtReturnPeriodYear`, "y"]]} /></td>
                    <td className="bf-w20 bf-c"><No n="8" />TAX TYPE</td>
                    <td className="bf-w30"><Txt k="txtTaxTypeCode" /></td>
                </tr>
            </T>
            <T>
                <H span={4}>PART I - BACKGROUND INFORMATION</H>
                <tr>
                    <td><No n="9" />TAX PAYER IDENTIFICATION NUMBER</td><td><No n="10" />RDO CODE</td>
                    <td><No n="11" />TAX PAYER CLASS.</td><td><No n="12" />LINE OF BUSINESS / OCCUPATION</td>
                </tr>
                <tr>
                    <td><Tin keys={[`${A}txtTIN1`, `${A}txtTIN2`, `${A}txtTIN3`, `${A}txtBranchCode`]} /></td>
                    <td><Txt k={`${A}txtRDOCode`} ro /></td>
                    <td><Opts group={[`${A}txtClassification:_1`, `${A}txtClassification:_2`]} labels={["I", "N"]} /></td>
                    <td><Txt k={`${A}txtLineBus`} /></td>
                </tr>
                <tr>
                    <td colSpan={2} className="bf-wrap-text"><No n="13" />TAXPAYER'S NAME (LAST NAME, FIRST NAME, MIDDLE NAME FOR INDIVIDUALS) / (REGISTERED NAME FOR NON-INDIVIDUALS)</td>
                    <td colSpan={2}><No n="14" />TELEPHONE NUMBER</td>
                </tr>
                <tr><td colSpan={2}><Txt k={`${A}txtTaxPayerName`} /></td><td colSpan={2}><Txt k={`${A}txtTelNum`} /></td></tr>
                <tr><td colSpan={2}><No n="15" />REGISTERED ADDRESS</td><td colSpan={2}><No n="16" />ZIP CODE</td></tr>
                <tr><td colSpan={2}><Txt k={`${A}txtAddress`} /></td><td colSpan={2}><Txt k={`${A}txtZipCode`} /></td></tr>
                <tr><td colSpan={2}><No n="17" />MANNER OF PAYMENT</td><td colSpan={2}><No n="18" />TYPE OF PAYMENT</td></tr>
            </T>
            <T>
                <tr className="bf-c"><td>VOLUNTARY PAYMENT</td><td>PER AUDIT/DELINQUENT ACCOUNT</td><td /></tr>
                <tr>
                    <td>
                        <Opts stack group={[1, 2, 3, 4, 5].map((i) => `${A}itemMannerOfPayment:_${i}`)}
                            labels={["SELF ASSESSMENT", "PENALTIES", "TAX DEPOSIT / ADVANCE PAYMENT", "INCOME TAX SECOND INSTALLMENT (INDIVIDUAL)", "OTHERS (SPECIFY)"]} />
                        <div className="bf-gap"><Txt k={`${A}txtOthersName`} /></div>
                    </td>
                    <td>
                        <Opts stack group={[`${A}itemMannerOfPaymentB:_1`, `${A}itemMannerOfPaymentB:_2`]}
                            labels={["PRELIMINARY/FINAL ASSESSMENT/DEFICIENCY TAX", "ACCOUNTS RECEIVABLE/DELINQUENT ACCOUNT"]} />
                    </td>
                    <td>
                        <Opts stack group={[`${A}itemModeOfPayment:_1`]} labels={["INSTALLMENT"]} />
                        <div className="bf-gap"><Txt k={`${A}txtNumOfInstallment`} /></div>
                        <Opts stack group={[`${A}itemModeOfPayment:_2`, `${A}itemModeOfPayment:_3`]} labels={["PARTIAL PAYMENT", "FULL PAYMENT"]} />
                    </td>
                </tr>
            </T>
            <T>
                <H span={3}>PART II - COMPUTATION OF TAX</H>
                <Line no="19" label="BASIC TAX/DEPOSIT/ADVANCE PAYMENT" k={`${A}txtTax19`} />
                <tr><td colSpan={3}><No n="20" />ADD: PENALTIES</td></tr>
            </T>
            <Penalties nos={["20A", "20B", "20C", "20D"]} keys={["20A", "20B", "20C", "20D"].map((x) => `${A}txtTax${x}`)} />
            <T><Line no="21" label="TOTAL AMOUNT PAYABLE (SUM OF ITEMS 19 AND 20D)" k={`${A}txtTax21`} ro /></T>
            <T>
                <tr>
                    <td className="bf-c" colSpan={2}>
                        <Opts group={[`${A}itemApprovedYN:_1`, `${A}itemApprovedYN:_2`]}
                            labels={["PRE-APPROVED BY INVESTIGATING OFFICE", "NOT APPROVED BY INVESTIGATING OFFICE"]} />
                    </td>
                </tr>
            </T>
        </>
    );
}

/* =========================================================
   0619E
   ========================================================= */
const E = "frm0619E:";
function L0619E() {
    return (
        <>
            <T>
                <tr>
                    <td><No n="1" />FOR THE MONTH OF (MM/YYYY)</td><td><No n="2" />DUE DATE (MM/DD/YYYY)</td><td><No n="3" />AMENDED RETURN ?</td>
                    <td><No n="4" />ANY TAXES WITHHELD</td><td><No n="5" />ATC</td><td><No n="6" />TAX TYPE CODE</td>
                </tr>
                <tr>
                    <td><MonthF parts={[[`${E}txtMonth`, "m"], [`${E}txtYear`, "y"]]} /></td>
                    <td><DateF parts={[[`${E}txtDueMonth`, "m"], [`${E}txtDueDay`, "d"], [`${E}txtDueYear`, "y"]]} /></td>
                    <td><Opts group={[`${E}optAmend:Y`, `${E}optAmend:N`]} labels={YN} /></td>
                    <td><Opts group={[`${E}optWithheld:Y`, `${E}optWithheld:N`]} labels={YN} /></td>
                    <td><Txt k={`${E}txtAtc`} /></td>
                    <td><Txt k={`${E}txtTaxTypeCode`} /></td>
                </tr>
            </T>
            <T>
                <H span={8}>PART I - BACKGROUND INFORMATION</H>
                <tr>
                    <td><No n="7" />TAXPAYER IDENTIFICATION NUMBER (TIN)</td>
                    <td><Txt k={`${E}txtTIN1`} ro c /></td><td><Txt k={`${E}txtTIN2`} ro c /></td>
                    <td><Txt k={`${E}txtTIN3`} ro c /></td><td><Txt k={`${E}txtBranchCode`} ro c /></td>
                    <td colSpan={2} className="bf-r"><No n="8" />RDO CODE</td>
                    <td><Txt k={`${E}txtRDOCode`} /></td>
                </tr>
                <tr><td colSpan={8}><No n="9" />WITHHOLDING AGENT'S NAME (LAST NAME, FIRST NAME, MIDDLE NAME FOR INDIVIDUAL OR REGISTERED NAME FOR NON-INDIVIDUAL)</td></tr>
                <tr><td colSpan={8}><Txt k={`${E}txtTaxpayerName`} ro /></td></tr>
                <tr><td colSpan={8} className="bf-wrap-text"><No n="10" />REGISTERED ADDRESS (INDICATE COMPLETE ADDRESS. IF BRANCH, INDICATE THE BRANCH ADDRESS. IF REGISTERED ADDRESS IS DIFFERENT FROM THE CURRENT ADDRESS, GO TO THE RDO TO UPDATE REGISTERED ADDRESS BY USING BIR FORM NO. 1905)</td></tr>
                <tr><td colSpan={8}><Txt k={`${E}txtAddress`} ro /></td></tr>
                <tr>
                    <td colSpan={6}><Free ro /></td>
                    <td className="bf-r"><No n="10A" />ZIP CODE</td>
                    <td><Txt k={`${E}txtZipCode`} ro /></td>
                </tr>
            </T>
            <T>
                <tr>
                    <td><No n="11" />CONTACT NUMBER</td>
                    <td colSpan={2}><Txt k={`${E}txtTelNum`} /></td>
                    <td colSpan={3} className="bf-r"><No n="12" />CATEGORY OF WITHHOLDING AGENT</td>
                    <td colSpan={2}><Opts group={[`${E}optCategory:P`, `${E}optCategory:G`]} labels={["PRIVATE", "GOVERNMENT"]} /></td>
                </tr>
                <tr><td><No n="13" />EMAIL ADDRESS</td><td colSpan={7}><Txt k="txtEmail" /></td></tr>
            </T>
            <T>
                <H span={3}>PART II - TAX REMITTANCE</H>
                <Line no="14" label="AMOUNT OF REMITTANCE" k={`${E}txtTax14`} />
                <Line no="15" label="LESS: AMOUNT REMITTED FROM PREVIOUSLY FILED FORM, IF THIS IS AN AMENDED FORM" k={`${E}txtTax15`} ro wrap />
                <Line no="16" label="NET AMOUNT OF REMITTANCE (ITEM 14 LESS ITEM 15)" k={`${E}txtTax16`} ro />
                <tr><td colSpan={3}><No n="17" />ADD : PENALTIES</td></tr>
                <Line no="17A" label="SURCHARGE" k={`${E}txtTax17A`} />
                <Line no="17B" label="INTEREST" k={`${E}txtTax17B`} />
                <Line no="17C" label="COMPROMISE" k={`${E}txtTax17C`} />
                <Line no="17D" label="TOTAL PENALTIES (SUM OF ITEMS 17A TO 17C)" k={`${E}txtTax17D`} ro />
                <Line no="18" label="TOTAL AMOUNT OF REMITTANCE (SUM OF ITEMS 16 AND 17D)" k={`${E}txtTax18`} ro />
            </T>
            <Declaration agent="txtTaxAgentNo" issue="txtDateIssue" expiry="txtDateExpiry" />
            <Payment
                rows={[["19", "CASH/BANK DEBIT MEMO", payKeys("", 19)], ["20", "CHECK", payKeys("", 20)], ["21", "TAX DEBIT MEMO", payKeys("", 21)]]}
                other={["22", { p: "txtParticular22", ...payKeys("", 22) }]}
            />
            <Note />
        </>
    );
}

/* =========================================================
   1601C (2 pages)
   ========================================================= */
const W = "frm1601c:";
function L1601C_1() {
    const g = (n) => `${W}txtTax${n}`;
    return (
        <>
            <T>
                <tr>
                    <td><No n="1" />FOR THE MONTH OF (MM/YYYY)</td><td><No n="2" />AMENDED RETURN ?</td><td><No n="3" />ANY TAXES WITHHELD?</td>
                    <td><No n="4" />NO. OF SHEETS ATTACHED</td><td><No n="5" />ATC</td>
                </tr>
                <tr>
                    <td><MonthF parts={[[`${W}txtMonth`, "m"], [`${W}txtYear`, "y"]]} /></td>
                    <td><Opts group={[`${W}AmendedRtn_1`, `${W}AmendedRtn_2`]} labels={YN} /></td>
                    <td><Opts group={[`${W}TaxWithheld_1`, `${W}TaxWithheld_2`]} labels={YN} /></td>
                    <td><Txt k={`${W}txtSheets`} /></td>
                    <td><Txt k={`${W}txtATC`} /></td>
                </tr>
            </T>
            <T>
                <H span={4}>PART I - BACKGROUND INFORMATION</H>
                <tr>
                    <td className="bf-w15"><No n="6" />TAXPAYER IDENTIFICATION NUMBER (TIN)</td>
                    <td><Tin keys={[`${W}txtTIN1`, `${W}txtTIN2`, `${W}txtTIN3`, `${W}txtBranchCode`]} /></td>
                    <td className="bf-w10 bf-r"><No n="7" />RDO CODE</td>
                    <td className="bf-w10"><Txt k={`${W}txtRDOCode`} /></td>
                </tr>
            </T>
            <T>
                <tr><td colSpan={3}><No n="8" />WITHHOLDING AGENT'S NAME (LAST NAME, FIRST NAME, MIDDLE NAME FOR INDIVIDUALS) / (REGISTERED NAME FOR NON-INDIVIDUALS)</td></tr>
                <tr><td colSpan={3}><Txt k={`${W}txtTaxpayerName`} /></td></tr>
                <tr><td colSpan={3}><No n="9" />REGISTERED ADDRESS</td></tr>
                <tr><td colSpan={3}><Txt k={`${W}txtAddress`} /></td></tr>
                <tr>
                    <td className="bf-w75"><Free /></td>
                    <td className="bf-w15"><No n="9A" />ZIP CODE</td>
                    <td className="bf-w10"><Txt k={`${W}txtZipCode`} /></td>
                </tr>
            </T>
            <T>
                <tr>
                    <td><No n="10" />CONTACT NUMBER</td>
                    <td><Txt k={`${W}txtTelNum`} /></td>
                    <td><No n="11" />CATEGORY OF WITHHOLDING AGENT</td>
                    <td><Opts group={[`${W}CatAgent_P`, `${W}CatAgent_G`]} labels={["PRIVATE", "GOVERNMENT"]} /></td>
                </tr>
                <tr><td><No n="12" />EMAIL ADDRESS</td><td colSpan={3}><Txt k="txtEmail" /></td></tr>
            </T>
            <T>
                <tr>
                    <td className="bf-wrap-text"><No n="13" />ARE THERE PAYEES AVAILING OF TAX RELIEF UNDER SPECIAL LAW OR INTERNATIONAL TAX TREATY?</td>
                    <td>
                        <Cell>
                            <Opts group={[`${W}SpecialTax_1`, `${W}SpecialTax_2`]} labels={YN} />
                            <span className="bf-lbl"><No n="13A" />IF YES, SPECIFY</span>
                            <Sel k={`${W}selTreaty`} options={TREATY} />
                        </Cell>
                    </td>
                </tr>
            </T>
            <T>
                <H span={3}>PART II - COMPUTATION OF TAX</H>
                <Line no="14" label="TOTAL AMOUNT OF COMPENSATION" k={g(14)} />
                <tr><td colSpan={3}>LESS: NON-TAXABLE/EXEMPT COMPENSATION</td></tr>
                <Line no="15" label="STATUTORY MINIMUM WAGE (MWES)" k={g(15)} />
                <Line no="16" label="HOLIDAY PAY, OVERTIME PAY, NIGHT SHIFT DIFFERENTIAL PAY, HAZARD PAY (FOR MWES ONLY)" k={g(16)} wrap />
                <Line no="17" label="13TH MONTH PAY AND OTHER BENEFITS" k={g(17)} />
                <Line no="18" label="DE MINIMIS BENEFITS" k={g(18)} />
                <Line no="19" label="SSS, GSIS, PHIC, HDMF MANDATORY CONTRIBUTIONS & UNION DUES (EMPLOYEE'S SHARE ONLY)" k={g(19)} wrap />
                <Line no="20" label="OTHER NON-TAXABLE COMPENSATION (SPECIFY)" k={g(20)} other={`${W}txt20Other`} />
                <Line no="21" label="TOTAL NON-TAXABLE COMPENSATION (SUM OF ITEMS 15 TO 20)" k={g(21)} ro />
                <Line no="22" label="TOTAL TAXABLE COMPENSATION (ITEM 14 LESS ITEM 21)" k={g(22)} ro />
                <Line no="23" label="LESS: TAXABLE COMPENSATION NOT SUBJECT TO WITHHOLDING TAX (FOR EMPLOYEES, OTHER THAN MWES, RECEIVING P250,000 & BELOW FOR THE YEAR)" k={g(23)} wrap />
                <Line no="24" label="NET TAXABLE COMPENSATION (ITEM 22 LESS ITEM 23)" k={g(24)} ro />
                <Line no="25" label="TOTAL TAXES WITHHELD" k={g(25)} />
                <Line no="26" label="ADD/(LESS): ADJUSTMENT OF TAXES WITHHELD FROM PREVIOUS MONTH/S (FROM PART IV-SCHEDULE 1, ITEM 4)" k={g(26)} ro wrap />
                <Line no="27" label="TAXES WITHHELD FOR REMITTANCE (SUM OF ITEMS 25 AND 26)" k={g(27)} ro />
                <Line no="28" label="LESS: TAX REMITTED IN RETURN PREVIOUSLY FILED, IF THIS IS AN AMENDED RETURN" k={g(28)} ro wrap />
                <Line no="29" label="OTHER REMITTANCES MADE (SPECIFY)" k={g(29)} other={`${W}txt29Other`} />
                <Line no="30" label="TOTAL TAX REMITTANCES MADE (SUM OF ITEMS 28 AND 29)" k={g(30)} ro />
                <Line no="31" label="TAX STILL DUE/(OVER-REMITTANCE) (ITEM 27 LESS ITEM 30)" k={g(31)} ro />
                <Line no="32" label="ADD: PENALTIES – SURCHARGE" k={g(32)} />
                <Line no="33" label="INTEREST" k={g(33)} />
                <Line no="34" label="COMPROMISE" k={g(34)} />
                <Line no="35" label="TOTAL PENALTIES (SUM OF 32 TO 34)" k={g(35)} ro />
                <Line no="36" label="TOTAL AMOUNT STILL DUE/(OVER-REMITTANCE) (SUM OF ITEMS 31 AND 35)" k={g(36)} ro />
            </T>
            <Declaration text={DECL_RETURN} agent="txtTaxAgentNo" issue="txtDateIssue" expiry="txtDateExpiry" />
            <Payment
                rows={[
                    ["37", "CASH/BANK DEBIT MEMO", payKeys(W, 37)],
                    ["38", "CHECK", payKeys(W, 38)],
                    ["39", "TAX DEBIT MEMO", payKeys(W, 39, true)],
                ]}
                other={["40", { p: `${W}txtParticular40`, ...payKeys(W, 40) }]}
            />
            <Note />
        </>
    );
}

function L1601C_2() {
    return (
        <>
            <T>
                <tr><td className="bf-w35">TIN</td><td>TAXPAYER'S LAST NAME (IF INDIVIDUAL) / REGISTERED NAME (IF NON-INDIVIDUAL)</td></tr>
                <tr>
                    <td><Tin keys={[`${W}txtPg2TIN1`, `${W}txtPg2TIN2`, `${W}txtPg2TIN3`, `${W}txtPg2BranchCode`]} /></td>
                    <td><Txt k={`${W}txtPg2TaxpayerName`} ro /></td>
                </tr>
            </T>
            <T>
                <tr className="bf-c"><td colSpan={6}>PART IV - SCHEDULE</td></tr>
                <tr><td colSpan={6}>SCHEDULE I - ADJUSTMENT OF TAXES WITHHELD ON COMPENSATION FROM PREVIOUS MONTHS (ATTACH ADDITIONAL SHEET/S, IF NECESSARY)</td></tr>
                <tr className="bf-c bf-sm">
                    <td className="bf-w4" />
                    <td>PREVIOUS MONTH/S<br />(MM/YYYY)<br />1</td>
                    <td>DATE PAID<br />(MM/DD/YYYY)<br />2</td>
                    <td>DRAWEE BANK/BANK<br />CODE/AGENCY<br />3</td>
                    <td>NUMBER<br />4</td>
                    <td>TAX PAID (EXCLUDING PENALTIES)<br />FOR THE MONTH<br />5</td>
                </tr>
                {[0, 1, 2].map((i) => (
                    <tr key={i}>
                        <td className="bf-c"><ChkOnly k={`chkScheduleDelete${i}`} /></td>
                        <td><Txt k={`${W}sched1:txtMonthYear${i}`} c /></td>
                        <td><Txt k={`${W}sched1:txtDatePaid${i}`} c /></td>
                        <td><Txt k={`${W}sched1:txtBankCode${i}`} c /></td>
                        <td><Txt k={`${W}sched1:txtNumber${i}`} c /></td>
                        <td><Num k={`${W}sched1:txtTaxPaid${i}`} /></td>
                    </tr>
                ))}
            </T>
            <T>
                <tr className="bf-c bf-sm">
                    <td className="bf-w4" />
                    <td>SHOULD BE TAX DUE FOR THE MONTH<br />6</td>
                    <td>ADJUSTMENT<br />7=(6 LESS 5)</td>
                </tr>
                {[0, 1, 2].map((i) => (
                    <tr key={i}>
                        <td className="bf-c">{i + 1}</td>
                        <td><Num k={`${W}sched1:txtShouldTaxDue${i}`} /></td>
                        <td><Num k={`${W}sched1:txtAdjustments${i}`} ro /></td>
                    </tr>
                ))}
                <tr>
                    <td colSpan={2} className="bf-c">TOTAL ADJUSTMENT (SUM OF ITEMS 1 TO 3) (TO PART II, ITEM 26)</td>
                    <td><Num k={`${W}sched1:txtTotal1`} ro /></td>
                </tr>
            </T>
        </>
    );
}

function ChkOnly({ k }) {
    const { vals, apply } = useB();
    return <input type="checkbox" aria-label="Delete row" checked={vals[k] === "true"} onChange={(e) => apply({ [k]: e.target.checked ? "true" : "false" })} />;
}

/* =========================================================
   1601EQ
   ========================================================= */
const Q = "frm1601EQ:";
function L1601EQ() {
    const g = (n) => `${Q}txtTax${n}`;
    const row = (no, label, k, ro) => (
        <tr key={no}>
            <td className="bf-w75"><No n={no} />{label}</td>
            <td><Cell><No n={no} /><Num k={k} ro={ro} /></Cell></td>
        </tr>
    );
    return (
        <>
            <T>
                <tr>
                    <td><No n="1" />FOR THE YEAR</td><td><No n="2" />QUARTER</td><td><No n="3" />AMENDED RETURN ?</td>
                    <td><No n="4" />ANY TAXES WITHHELD</td><td><No n="5" />NO. OF SHEETS ATTACHED?</td>
                </tr>
                <tr>
                    <td><Txt k={`${Q}txtYear`} /></td>
                    <td><Opts group={[1, 2, 3, 4].map((i) => `${Q}optQuarter:${i}`)} labels={Q4} /></td>
                    <td><Opts group={[`${Q}optAmend:Y`, `${Q}optAmend:N`]} labels={YN} /></td>
                    <td><Opts group={[`${Q}optWithheld:Y`, `${Q}optWithheld:N`]} labels={YN} /></td>
                    <td><Txt k={`${Q}txtNoSheets`} /></td>
                </tr>
            </T>
            <T>
                <H span={4}>PART I - BACKGROUND INFORMATION</H>
                <tr>
                    <td><No n="6" />TAX PAYER IDENTIFICATION NUMBER (TIN)</td>
                    <td><Tin keys={[`${Q}txtTIN1`, `${Q}txtTIN2`, `${Q}txtTIN3`, `${Q}txtBranchCode`]} /></td>
                    <td className="bf-r"><No n="7" />RDO CODE</td>
                    <td><Txt k={`${Q}txtRDOCode`} /></td>
                </tr>
            </T>
            <T>
                <tr><td><No n="8" />WITHHOLDING AGENT'S NAME (LAST NAME, FIRST NAME, MIDDLE NAME FOR INDIVIDUAL OR REGISTERED NAME FOR NON-INDIVIDUAL)</td></tr>
                <tr><td><Txt k={`${Q}txtTaxpayerName`} ro /></td></tr>
                <tr><td className="bf-wrap-text"><No n="9" />REGISTERED ADDRESS (INDICATE COMPLETE ADDRESS. IF BRANCH, INDICATE THE BRANCH ADDRESS. IF REGISTERED ADDRESS IS DIFFERENT FROM THE CURRENT ADDRESS, GO TO THE RDO TO UPDATE REGISTERED ADDRESS BY USING BIR FORM NO. 1905)</td></tr>
                <tr><td><Txt k={`${Q}txtAddress`} ro /></td></tr>
            </T>
            <T>
                <tr>
                    <td className="bf-w70"><Free /></td>
                    <td className="bf-w15 bf-r"><No n="9A" />ZIP CODE</td>
                    <td className="bf-w15"><Txt k={`${Q}txtZipCode`} ro /></td>
                </tr>
            </T>
            <T>
                <tr>
                    <td><No n="10" />CONTACT NUMBER</td>
                    <td><Txt k={`${Q}txtTelNum`} /></td>
                    <td className="bf-r"><No n="11" />CATEGORY OF WITHHOLDING AGENT</td>
                    <td><Opts group={[`${Q}optCategory:P`, `${Q}optCategory:G`]} labels={["PRIVATE", "GOVERNMENT"]} /></td>
                </tr>
                <tr><td><No n="12" />EMAIL ADDRESS</td><td colSpan={3}><Txt k="txtEmail" ro /></td></tr>
            </T>
            <T>
                <H span={4}>PART II - COMPUTATION OF TAX</H>
                <tr className="bf-c">
                    <td className="bf-w25">ATC</td><td className="bf-w25">TAX BASE (CONSOLIDATED FOR THE QUARTER)</td>
                    <td className="bf-w25">TAX RATE</td><td className="bf-w25">TAX WITHHELD (CONSOLIDATED FOR THE QUARTER)</td>
                </tr>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <tr key={i}>
                        <td><Cell><No n={12 + i} /><Txt k={`${Q}txtAtcCd${i}`} c /></Cell></td>
                        <td><Num k={`${Q}txtTaxBase${i}`} blank="" /></td>
                        <td><Txt k={`${Q}txtTaxRate${i}`} r /></td>
                        <td><Cell><No n="%" /><Num k={`${Q}txtTaxbeWithHeld${i}`} ro /></Cell></td>
                    </tr>
                ))}
            </T>
            <T cls="bf-mt">
                {row("19", "TOTAL TAXES WITHHELD FOR THE QUARTER (SUM OF ITEMS 13 TO 18)", g(19), true)}
                {row("20", "LESS: REMITTANCES MADE: 1ST MONTH OF THE QUARTER", g(20))}
                {row("21", "2ND MONTH OF THE QUARTER", g(21))}
                {row("22", "TAX REMITTED IN RETURN PREVIOUSLY FILED, IF THIS IS AN AMENDED RETURN", g(22), true)}
                {row("23", "OVER-REMITTANCE FROM PREVIOUS QUARTER OF THE SAME TAXABLE YEAR", g(23))}
                {row("24", "TOTAL REMITTANCES MADE (SUM OF ITEMS 20 TO 23)", g(24), true)}
                {row("25", "TAX STILL DUE/(OVER-REMITTANCE) (ITEM 19 LESS ITEM 24)", g(25), true)}
                <tr><td colSpan={2}>ADD: PENALTIES</td></tr>
                {row("26", "SURCHARGE", g(26))}
                {row("27", "INTEREST", g(27))}
                {row("28", "COMPROMISE", g(28))}
                {row("29", "TOTAL PENALTIES (SUM OF ITEM 26 TO 28)", g(29), true)}
                {row("30", "TOTAL AMOUNT STILL DUE/(OVER-REMITTANCE) (SUM OF ITEMS 25 AND 29)", g(30), true)}
            </T>
            <T cls="bf-mt">
                <tr>
                    <td className="bf-wrap-text">IF OVER-REMITTANCE, MARK ONE (1) BOX ONLY</td>
                    <td className="bf-c"><Chk k={`${Q}ifRefund`} label="TO BE REFUNDED" /></td>
                    <td className="bf-c"><Chk k={`${Q}ifIssueCert`} label="TO BE ISSUED TAX CREDIT CERTIFICATE" /></td>
                    <td className="bf-c"><Chk k={`${Q}ifCarriedOver`} label="TO BE CARRIED OVER TO THE NEXT QUARTER WITHIN THE SAME CALENDAR YEAR (NOT APPLICABLE FOR SUCCEEDING YEAR)" /></td>
                </tr>
            </T>
            <Declaration agent="txtTaxAgentNo" issue="txtDateIssue" expiry="txtDateExpiry" />
            <Payment
                rows={[["31", "CASH/BANK DEBIT MEMO", payKeys(Q, 33)], ["32", "CHECK", payKeys(Q, 34)], ["33", "TAX DEBIT MEMO", payKeys(Q, 35)]]}
                other={["34", { p: `${Q}txtParticular36`, ...payKeys(Q, 36) }]}
            />
            <Note />
        </>
    );
}

/* =========================================================
   2550M
   ========================================================= */
const M = "frm2550m:";
function L2550M() {
    const g = (n) => `${M}txtTax${n}`;
    // label | column A | column B
    const AB = ({ no, label, a, aRo, b, bRo, sub, wrap }) => (
        <tr>
            <td className={wrap ? "bf-wrap-text" : ""}>{sub ? <ul className="bf-ul"><li><No n={no} />{label}</li></ul> : <><No n={no} />{label}</>}</td>
            <td>{a && <Cell><No n={a} /><Num k={g(a)} ro={aRo} /></Cell>}</td>
            <td>{b && <Cell><No n={b} /><Num k={g(b)} ro={bRo} /></Cell>}</td>
        </tr>
    );
    return (
        <>
            <T>
                <tr>
                    <td><No n="1" />FOR THE MONTH OF (MM/YYYY)</td>
                    <td><MonthF parts={[[`${M}RtnYear`, "m"], [`${M}txtYear`, "y"]]} /></td>
                    <td><No n="2" />AMENDED RETURN ?</td>
                    <td><Opts group={[`${M}OptAmendedYN1`, `${M}OptAmendedYN2`]} labels={YN} /></td>
                    <td><No n="3" />NO. OF SHEETS ATTACHED?</td>
                    <td><Txt k={`${M}txtSheets`} /></td>
                </tr>
            </T>
            <T>
                <H span={6}>PART I - BACKGROUND INFORMATION</H>
                <tr>
                    <td className="bf-w10"><No n="4" />(TIN)</td>
                    <td className="bf-w25"><Tin keys={[`${M}txtTIN1`, `${M}txtTIN2`, `${M}txtTIN3`, `${M}txtBranchCode`]} /></td>
                    <td className="bf-w10 bf-r"><No n="5" />RDO CODE</td>
                    <td className="bf-w10"><Txt k={`${M}txtRDOCode`} /></td>
                    <td className="bf-w20 bf-r"><No n="6" />LINE OF BUSINESS/OCCUPATION</td>
                    <td className="bf-w25"><Txt k={`${M}txtLineBus`} /></td>
                </tr>
            </T>
            <T>
                <tr>
                    <td className="bf-w15"><No n="7" />TAX PAYER'S NAME</td><td className="bf-w35"><Txt k={`${M}txtTaxPayerName`} /></td>
                    <td className="bf-w15"><No n="8" />TELEPHONE NUMBER</td><td className="bf-w35"><Txt k={`${M}txtTelephoneNum`} /></td>
                </tr>
                <tr>
                    <td><No n="9" />REGISTERED ADDRESS</td><td><Txt k={`${M}txtAddress`} /></td>
                    <td><No n="10" />ZIP CODE</td><td><Txt k={`${M}txtZipCode`} /></td>
                </tr>
            </T>
            <T>
                <tr>
                    <td className="bf-wrap-text"><No n="11" />ARE YOU AVAILING OF TAX RELIEF UNDER SPECIAL LAW / INTERNATIONAL TAX TREATY?</td>
                    <td className="bf-c"><Opts group={[`${M}OptSpecialTax1`, `${M}OptSpecialTax2`]} labels={YN} /></td>
                    <td><Cell><span className="bf-lbl">IF YES, SPECIFY</span><Sel k={`${M}lstSpecialTax`} options={TREATY} /></Cell></td>
                </tr>
            </T>
            <T>
                <H span={3}>PART II - COMPUTATION OF TAX</H>
                <tr className="bf-c"><td className="bf-w34" /><td className="bf-w33">SALES/RECEIPTS FOR THE MONTH (EXCLUSIVE OF VAT)</td><td className="bf-w33">OUTPUT TAX DUE FOR THE MONTH</td></tr>
                <AB no="12" label="VATABLE SALES/RECEIPT – PRIVATE (SCH. 1)" a="12A" aRo b="12B" bRo />
                <AB no="13" label="SALES TO GOVERNMENT" a="13A" b="13B" bRo />
                <AB no="14" label="ZERO-RATED SALES/RECEIPTS" a="14" />
                <AB no="15" label="EXEMPT SALES/RECEIPTS" a="15" />
                <AB no="16" label="TOTAL SALES/RECEIPTS AND OUTPUT TAX DUE" a="16A" aRo b="16B" bRo />
                <tr><td colSpan={3}><No n="17" />LESS: ALLOWABLE INPUT TAX</td></tr>
                <AB sub no="17A" label="INPUT TAX CARRIED OVER FROM PREVIOUS PERIOD" b="17A" />
                <AB sub wrap no="17B" label="INPUT TAX DEFERRED ON CAPITAL GOODS EXCEEDING P1 MILLION FROM PREVIOUS PERIOD" b="17B" />
                <AB sub no="17C" label="TRANSITIONAL INPUT TAX" b="17C" />
                <AB sub no="17D" label="PRESUMPTIVE INPUT TAX" b="17D" />
                <AB sub no="17E" label="OTHERS" b="17E" />
                <AB sub no="17F" label="TOTAL (SUM OF ITEM 17A, 17B, 17C, 17D & 17E)" b="17F" bRo />
                <tr><td><No n="18" />CURRENT TRANSACTION</td><td className="bf-c">PURCHASES</td><td /></tr>
                <AB sub no="18A/B" label="PURCHASE OF CAPITAL GOODS NOT EXCEEDING P1 MILLION (SEE SCH. 2)" a="18A" aRo b="18B" bRo />
                <AB sub no="18C/D" label="PURCHASE OF CAPITAL GOODS EXCEEDING P1 MILLION (SEE SCH. 3)" a="18C" aRo b="18D" bRo />
                <AB sub no="18E/F" label="DOMESTIC PURCHASES OF GOODS OTHER THAN CAPITAL GOODS" a="18E" b="18F" bRo />
                <AB sub no="18G/H" label="IMPORTATION OF GOODS OTHER THAN CAPITAL GOODS" a="18G" b="18H" bRo />
                <AB sub no="18I/J" label="DOMESTIC PURCHASE OF SERVICES" a="18I" b="18J" bRo />
                <AB sub no="18K/L" label="SERVICES RENDERED BY NON-RESIDENTS" a="18K" b="18L" bRo />
                <AB sub no="18M" label="PURCHASES NOT QUALIFIED FOR INPUT TAX" a="18M" />
                <AB sub no="18N/O" label="OTHERS" a="18N" b="18O" bRo />
                <AB sub no="18P" label="TOTAL CURRENT PURCHASES (SUM OF ITEM 18A, 18C, 18E, 18G, 18I, 18K, 18M & 18N)" a="18P" aRo />
                <AB no="19" label="TOTAL AVAILABLE INPUT TAX (SUM OF ITEM 17F, 18B, 18D, 18F, 18H, 18J, 18L & 18O)" b="19" bRo />
                <tr><td colSpan={3}><No n="20" />LESS: DEDUCTION FROM INPUT TAX</td></tr>
                <AB sub wrap no="20A" label="INPUT TAX ON PURCHASES OF CAPITAL GOODS EXCEEDING P1 MILLION DEFERRED FOR THE SUCCEEDING PERIOD (SEE SCH. 3)" b="20A" bRo />
                <AB sub wrap no="20B" label="INPUT TAX ON SALE TO GOV'T. CLOSED TO EXPENSE (SCH. 4)" b="20B" bRo />
                <AB sub wrap no="20C" label="INPUT TAX ALLOCABLE TO EXEMPT SALES (SCH. 5)" b="20C" bRo />
                <AB sub no="20D" label="VAT REFUND/TCC CLAIMED" b="20D" />
                <AB sub no="20E" label="OTHERS" b="20E" />
                <AB sub no="20F" label="TOTAL (SUM OF ITEM 20A, 20B, 20C, 20D & 20E)" b="20F" bRo />
                <AB no="21" label="TOTAL ALLOWABLE INPUT TAX (ITEM 19 LESS ITEM 20F)" b="21" bRo />
                <AB no="22" label="NET VAT PAYABLE (ITEM 16B LESS ITEM 21)" b="22" bRo />
                <tr><td colSpan={3}><No n="23" />LESS: TAX CREDITS/PAYMENTS</td></tr>
                <AB sub wrap no="23A" label="CREDITABLE VALUE-ADDED TAX WITHHELD (SEE SCH. 6)" b="23A" bRo />
                <AB sub wrap no="23B" label="ADVANCE PAYMENT (SCH. 7)" b="23B" bRo />
                <AB sub wrap no="23C" label="VAT WITHHELD ON SALES TO GOVERNMENT (SCH. 8)" b="23C" bRo />
                <AB sub wrap no="23D" label="VAT PAID IN RETURN PREVIOUSLY FILED, IF THIS IS AN AMENDED RETURN" b="23D" bRo />
                <AB sub wrap no="23E" label="ADVANCE PAYMENTS MADE (PLEASE ATTACH PROOF OF PAYMENTS - BIR FORM NO. 0605)" b="23E" />
                <AB sub no="23F" label="OTHERS" b="23F" />
                <AB sub wrap no="23G" label="TOTAL TAX CREDITS/PAYMENTS (SUM OF ITEM 23A, 23B, 23C, 23D & 23E)" b="23G" bRo />
                <AB no="24" label="TAX STILL PAYABLE/(OVERPAYMENT) (ITEM 22 LESS ITEM 23F)" b="24" bRo />
                <tr><td><No n="25" />ADD : PENALTIES</td><td colSpan={2} /></tr>
                <tr><td colSpan={3} className="bf-p0"><Penalties nos={["25A", "25B", "25C", "25D"]} keys={["25A", "25B", "25C", "25D"].map(g)} /></td></tr>
                <AB no="26" label="TOTAL AMOUNT PAYABLE/(OVERPAYMENT) (SUM OF ITEMS 24 & 25D)" b="26" bRo />
            </T>
        </>
    );
}

/* =========================================================
   2550Q (v2024) – 2 pages
   ========================================================= */
const V = "frm2550qv2024:";
const vLine = (no, label, k, ro, other) => <Line key={no} no={no} label={label} k={`${V}${k}`} ro={ro} other={other ? `${V}${other}` : undefined} />;

function L2550Q_1() {
    return (
        <>
            <T>
                <tr>
                    <td className="bf-w33"><Cell><No n="1" />FOR THE<Opts group={[`${V}calendarNo1`, `${V}fiscalNo1`]} labels={["CALENDAR", "FISCAL"]} /></Cell></td>
                    <td className="bf-w16"><No n="2" />YEAR ENDED (MM/YYYY)</td>
                    <td className="bf-w17"><MonthF parts={[[`${V}selectedMonthNo2`, "mn"], [`${V}txtYearNo2`, "y"]]} /></td>
                    <td className="bf-w33"><Cell><No n="3" />QUARTER<Opts group={[1, 2, 3, 4].map((i) => `${V}OptQuarter${i}`)} labels={Q4} /></Cell></td>
                </tr>
                <tr>
                    <td>
                        <div><No n="4" />RETURN PERIOD (MM/DD/YYYY)</div>
                        <div className="bf-two"><DateF parts={[[`${V}RtnPeriodFromNo4`, "mdy"]]} ro /><DateF parts={[[`${V}RtnPeriodToNo4`, "mdy"]]} ro /></div>
                    </td>
                    <td colSpan={2}><Cell><No n="5" />AMENDED RETURN ?<Opts group={[`${V}amendedReturnYesNo5`, `${V}amendedReturnNo5`]} labels={YN} /></Cell></td>
                    <td><Cell><No n="6" />SHORT PERIOD RETURN ?<Opts group={[`${V}OptShortPrd1`, `${V}OptShortPrd2`]} labels={YN} /></Cell></td>
                </tr>
            </T>
            <T>
                <H span={4}>PART I - BACKGROUND INFORMATION</H>
                <tr>
                    <td><No n="7" />TAXPAYER IDENTIFICATION NUMBER (TIN)</td>
                    <td><Tin keys={[`${V}txtTIN1`, `${V}txtTIN2`, `${V}txtTIN3`, `${V}branchCode`]} /></td>
                    <td className="bf-r"><No n="8" />RDO CODE</td>
                    <td><Txt k={`${V}txtRDOCode`} /></td>
                </tr>
                <tr><td colSpan={4}><No n="9" />TAXPAYER'S NAME (LAST NAME, FIRST NAME, MIDDLE NAME FOR INDIVIDUAL OR REGISTERED NAME FOR NON-INDIVIDUAL)</td></tr>
                <tr><td colSpan={4}><Txt k={`${V}taxpayerName`} /></td></tr>
                <tr><td colSpan={4} className="bf-wrap-text"><No n="10" />REGISTERED ADDRESS (INDICATE COMPLETE ADDRESS. IF BRANCH, INDICATE THE BRANCH ADDRESS. IF THE REGISTERED ADDRESS IS DIFFERENT FROM THE CURRENT ADDRESS, GO TO THE RDO TO UPDATE REGISTERED ADDRESS BY USING BIR FORM NO. 1905)</td></tr>
                <tr>
                    <td colSpan={2}><Txt k={`${V}taxpayerAddress`} /></td>
                    <td><No n="10A" />ZIP CODE</td>
                    <td><Txt k={`${V}taxpayerZip`} /></td>
                </tr>
            </T>
            <T>
                <tr><td className="bf-w35"><No n="11" />CONTACT NUMBER (LANDLINE/CELLPHONE NO.)</td><td><No n="12" />EMAIL ADDRESS</td></tr>
                <tr><td><Txt k={`${V}taxpayerContactNumber`} /></td><td><Txt k={`${V}taxpayerEmailAddress`} /></td></tr>
            </T>
            <T>
                <tr>
                    <td>
                        <Cell>
                            <No n="13" />TAXPAYER CLASSIFICATION
                            <Opts group={[1, 2, 3, 4].map((i) => `${V}taxPayerClassification${i}`)} labels={["MICRO", "SMALL", "MEDIUM", "LARGE"]} />
                        </Cell>
                    </td>
                </tr>
            </T>
            <T>
                <tr>
                    <td className="bf-wrap-text"><No n="14" />ARE YOU AVAILING OF TAX RELIEF UNDER SPECIAL LAW / INTERNATIONAL TAX TREATY?</td>
                    <td className="bf-c"><Opts group={[`${V}internationalTreatyYn`, `${V}specialRateYn`]} labels={YN} /></td>
                    <td><Cell><span className="bf-lbl"><No n="14A" />IF YES, SPECIFY</span><Sel k={`${V}specifyInternationalTreaty`} options={TREATY} /></Cell></td>
                </tr>
            </T>
            <T>
                <H span={3}>PART II - COMPUTATION OF TAX</H>
                {vLine("15", "NET VAT PAYABLE/(EXCESS INPUT TAX) (FROM PART IV, ITEM 61)", "excessInputTax", true)}
                <tr><td colSpan={3}>LESS: TAX CREDITS/PAYMENTS</td></tr>
                {vLine("16", "CREDITABLE VAT WITHHELD (FROM PART V - SCHEDULE 3, COLUMN D)", "creditableVat", true)}
                {vLine("17", "ADVANCE VAT PAYMENTS (FROM PART V - SCHEDULE 4)", "advVatPayment", true)}
                {vLine("18", "VAT PAID IN RETURN PREVIOUSLY FILED, IF THIS IS AN AMENDED RETURN", "vatPaidReturn", true)}
                {vLine("19", "OTHER CREDITS/PAYMENT (SPECIFY)", "otherCreditsNo19", true, "addSpecifyNo19")}
                {vLine("20", "TOTAL TAX CREDITS/PAYMENT (SUM OF ITEM 16 TO 19)", "totalTaxCredits", true)}
                {vLine("21", "TAX STILL PAYABLE/(EXCESS CREDITS) (ITEM 15 LESS ITEM 20)", "excessCredits", true)}
                <tr><td colSpan={3}>ADD PENALTIES</td></tr>
                {vLine("22", "SURCHARGE", "surcharge")}
                {vLine("23", "INTEREST", "interest")}
                {vLine("24", "COMPROMISE", "compromise")}
                {vLine("25", "TOTAL PENALTIES (SUM OF ITEMS 22 TO 24)", "penalties", true)}
                {vLine("26", "TOTAL AMOUNT PAYABLE/(EXCESS CREDITS) (SUM OF ITEMS 21 AND 25)", "totalPayable", true)}
            </T>
            <Declaration />
            <Payment
                rows={[["27", "CASH/BANK DEBIT ADVICE", null], ["28", "CHECK", null], ["29", "TAX DEBIT MEMO", null]]}
                other={["30", null]}
            />
            <Note text={NOTE_B} />
        </>
    );
}

function Sched3() {
    const { vals, apply } = useB();
    const rows = vals.__sched3?.length ? vals.__sched3 : [{}, {}];
    const setRow = (i, k, v) => apply({ __sched3: rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)) });
    const total = (k) => f(rows.reduce((a, r) => a + p(r[k]), 0));
    return (
        <T>
            <tr className="bf-c"><td>(A) PERIOD COVERED</td><td>(B) NAME OF WITHHOLDING AGENT</td><td>(C) INCOME PAYMENT</td><td>(D) TOTAL TAX WITHHELD</td></tr>
            {rows.map((r, i) => (
                <tr key={i}>
                    <td>
                        <div className="bf-two">
                            <input className="input bf-in ta-center" value={r.from || ""} placeholder="MM/DD/YYYY" onChange={(e) => setRow(i, "from", e.target.value)} />
                            <input className="input bf-in ta-center" value={r.to || ""} placeholder="MM/DD/YYYY" onChange={(e) => setRow(i, "to", e.target.value)} />
                        </div>
                    </td>
                    <td><input className="input bf-in" readOnly tabIndex={-1} value={r.name || ""} /></td>
                    <td><input className="input bf-in ta-right mono" readOnly tabIndex={-1} value={r.income || "0.00"} /></td>
                    <td><input className="input bf-in ta-right mono" readOnly tabIndex={-1} value={r.tax || "0.00"} /></td>
                </tr>
            ))}
            <tr>
                <td colSpan={2}>TOTAL (COLUMN D - TO PART II, ITEM 16)</td>
                <td><input className="input bf-in ta-right mono" readOnly tabIndex={-1} value={total("income")} /></td>
                <td><input className="input bf-in ta-right mono" readOnly tabIndex={-1} value={total("tax")} /></td>
            </tr>
            <tr><td colSpan={4}>SCHEDULE 4 - ADVANCE VAT PAYMENT (ATTACH ADDITIONAL SHEET/S IF NECESSARY) (SCH. 4)</td></tr>
        </T>
    );
}

function L2550Q_2() {
    const ab = (no, label, a, aRo, b, bRo, other) => (
        <tr key={no}>
            <td>{other ? <Cell><No n={no} /><span>{label}</span><Txt k={`${V}${other}`} /></Cell> : <><No n={no} />{label}</>}</td>
            <td>{a && <Num k={a.startsWith("other") && !a.includes(":") && a === "otherSpecify47B" ? a : `${V}${a}`} ro={aRo} />}</td>
            <td>{b && <Num k={b === "otherSpecify47B" ? b : `${V}${b}`} ro={bRo} />}</td>
        </tr>
    );
    const bOnly = (no, label, b, bRo, other, wrap) => (
        <tr key={no}>
            <td colSpan={2} className={wrap ? "bf-wrap-text" : ""}>
                {other ? <Cell><No n={no} /><span>{label}</span><Txt k={`${V}${other}`} /></Cell> : <><No n={no} />{label}</>}
            </td>
            <td className="bf-w25"><Num k={`${V}${b}`} ro={bRo} /></td>
        </tr>
    );
    return (
        <>
            <T>
                <tr><td className="bf-w35">TIN</td><td>TAXPAYER'S LAST NAME (IF INDIVIDUAL) / REGISTERED NAME (IF NON-INDIVIDUAL)</td></tr>
                <tr>
                    <td><Tin keys={[`${V}txtPg2TIN1`, `${V}txtPg2TIN2`, `${V}txtPg2TIN3`, `${V}txtPg2BranchCode`]} /></td>
                    <td><Txt k={`${V}Pg2TaxPayer`} ro /></td>
                </tr>
            </T>
            <T>
                <H span={3}>PART IV - DETAILS OF VAT COMPUTATION</H>
                <tr className="bf-c"><td>TOTAL SALES AND OUTPUT TAX</td><td>A. SALES FOR THE QUARTER (EXCLUSIVE OF VAT)</td><td>B. OUTPUT TAX FOR THE QUARTER</td></tr>
                {ab("31", "VATABLE SALES", "vatableSales", true, "outputVatSales", true)}
                {ab("32", "ZERO RATED SALES", "zeroRatedSales", true)}
                {ab("33", "EXEMPT SALES", "exemptSales", true)}
                {ab("34", "TOTAL SALES & OUTPUT TAX DUE (SUM OF ITEMS 31A TO 33A)/(ITEM 31B)", "totalSales", true, "outputTaxDue", true)}
                {bOnly("35", "LESS: OUTPUT VAT ON UNCOLLECTED RECEIVABLES", "lessOutputVat")}
                {bOnly("36", "ADD: OUTPUT VAT ON RECOVERED UNCOLLECTED RECEIVABLES PREVIOUSLY DEDUCTED", "addOutputVat")}
                {bOnly("37", "TOTAL ADJUSTED OUTPUT TAX DUE (ITEM 34B LESS ITEM 35B ADD ITEM 36B)", "totalAdjOutput", true)}
                <tr><td colSpan={2}><b>LESS: ALLOWABLE INPUT TAX</b></td><td className="bf-c">B. INPUT TAX</td></tr>
                {bOnly("38", "INPUT TAX CARRIED OVER FROM PREVIOUS QUARTER", "inputTaxCarried")}
                {bOnly("39", "INPUT TAX DEFERRED ON CAPITAL GOODS EXCEEDING P1 MILLION FROM PREVIOUS QUARTER (FROM PART V - SCHEDULE 1 COL E)", "inputTaxDeferred", true, null, true)}
                {bOnly("40", "TRANSITIONAL INPUT TAX", "transitionalInputTax", true)}
                {bOnly("41", "PRESUMPTIVE INPUT TAX", "presumptiveInputTax", true)}
                {bOnly("42", "OTHER (SPECIFY)", "otherSpecify42", true, "addSpecifyNo42")}
                {bOnly("43", "TOTAL (SUM OF ITEMS 38B TO 42B)", "total43", true)}
                <tr className="bf-c"><td>CURRENT TRANSACTIONS</td><td>A. PURCHASES</td><td>B. INPUT TAX</td></tr>
                {ab("44", "DOMESTIC PURCHASES", "domesticPurchase", false, "domesticInputTax", true)}
                {ab("45", "SERVICES RENDERED BY NON-RESIDENTS", "servicesPurchase", false, "serviceInputTax", true)}
                {ab("46", "IMPORTATION", "importPurchase", false, "importInputTax", true)}
                {ab("47", "OTHER (SPECIFY)", "otherSpecify47", true, "otherSpecify47B", true, "addSpecifyNo47")}
                {ab("48", "DOMESTIC PURCHASES WITH NO INPUT TAX", "domesticPurchaseNoTax", true)}
                {ab("49", "VAT - EXEMPT IMPORTATIONS", "vatExemptImports", true)}
                {ab("50", "TOTAL CURRENT PURCHASES/INPUT TAX (SUM OF ITEMS 44A TO 49A)/(SUM OF ITEMS 44B TO 47B)", "totalCurPurchase", true, "totalCurInputTax", true)}
                {bOnly("51", "TOTAL AVAILABLE INPUT TAX (SUM OF ITEMS 43B AND 50B)", "totalAvailInputTax", true)}
                <tr><td colSpan={2}>LESS: ADJUSTMENT/DEDUCTIONS FROM INPUT TAX</td><td className="bf-c">B. INPUT TAX</td></tr>
                {bOnly("52", "INPUT TAX ON PURCHASES/IMPORTATION OF CAPITAL GOODS EXCEEDING P1 MILLION DEFERRED FOR THE SUCCEEDING PERIOD (FROM PART V SCHEDULE 1, COLUMN I)", "importCapitalInputTax", true, null, true)}
                {bOnly("53", "INPUT TAX ATTRIBUTABLE TO VAT EXEMPT SALES (FROM PART V - SCHEDULE 2)", "inputTaxAttr", true, null, true)}
                {bOnly("54", "VAT REFUND/TCC CLAIMED", "vatRefund", true)}
                {bOnly("55", "INPUT VAT ON UNPAID PAYABLES", "inputVatUnpaid", true)}
                {bOnly("56", "OTHER (SPECIFY)", "otherSpecify56", true, "addSpecifyNo56")}
                {bOnly("57", "TOTAL DEDUCTIONS FROM INPUT TAX (SUM OF ITEMS 52B TO 56B)", "totalDeductions", true)}
                {bOnly("58", "ADD: INPUT VAT ON SETTLED UNPAID PAYABLES PREVIOUSLY DEDUCTED", "addInputVat", true)}
                {bOnly("59", "ADJUSTED DEDUCTIONS FROM INPUT TAX (SUM OF ITEMS 57B AND 58B)", "adjDeductions", true)}
                {bOnly("60", "TOTAL ALLOWABLE INPUT TAX (ITEM 51B LESS ITEM 59B)", "totalAllowInputTax", true)}
                {bOnly("61", "NET VAT PAYABLE/(EXCESS INPUT TAX) (ITEM 37B LESS ITEM 60B) (TO PART II, ITEM 15)", "netVatPayable", true, null, true)}
            </T>
            <T>
                <H span={9}>PART V - SCHEDULES</H>
                <H span={9}>SCHEDULE 1 - AMORTIZED INPUT TAX FROM CAPITAL GOODS (ATTACH ADDITIONAL SHEET/S, IF NECESSARY) (SCH. 1)</H>
                <tr className="bf-c bf-sm">
                    <td className="bf-wrap-text">DATE PURCHASED / IMPORTED (MM/DD/YYYY)</td><td className="bf-wrap-text">SOURCE CODE*</td><td>DESCRIPTION</td>
                    <td className="bf-wrap-text">AMOUNT OF PURCHASES / IMPORTATION OF CAPITAL GOODS EXCEEDING P1M</td>
                    <td className="bf-wrap-text">BALANCE OF INPUT TAX FROM PREVIOUS PERIOD</td><td className="bf-wrap-text">ESTIMATED LIFE (IN MONTHS)</td>
                    <td className="bf-wrap-text">RECOGNIZED LIFE (IN MONTHS) REMAINING LIFE</td><td className="bf-wrap-text">ALLOWED INPUT TAX FOR THE PERIOD**</td>
                    <td className="bf-wrap-text">BALANCE OF INPUT TAX TO BE CARRIED TO NEXT PERIOD (E) LESS (H)</td>
                </tr>
                <tr className="bf-c bf-sm">{["A", "B", "C", "D", "E", "F", "G", "H", "I"].map((x) => <td key={x}>({x})</td>)}</tr>
                {[10, 11].map((i) => (
                    <tr key={i}>
                        <td><Txt k={`txtDatePurchase${i}`} /></td>
                        <td><Txt k={`txtSourceCode${i}`} /></td>
                        <td><Txt k={`txtDescription${i}`} /></td>
                        <td><Num k={`txtAmountPurchase${i}`} ro /></td>
                        <td><Num k={`txtInputTax${i}`} ro /></td>
                        <td><Num k={`txtEstimatedLife${i}`} ro /></td>
                        <td><Num k={`txtRecognizedLife${i}`} ro /></td>
                        <td><Num k={`txtAllowedInputTax${i}`} ro /></td>
                        <td><Num k={`txtBalanceInputTax${i}`} ro /></td>
                    </tr>
                ))}
                <tr>
                    <td colSpan={4} /><td><Num k="sched1TotalBalPrev" ro /></td><td /><td /><td /><td><Num k="sched1TotalBalNext" ro /></td>
                </tr>
            </T>
            <T>
                <tr><td className="bf-sm">* D FOR DOMESTIC PURCHASE; I FOR IMPORTATION</td><td className="bf-sm">** E DIVIDED BY G MULTIPLIED BY THE NUMBER OF MONTHS IN USE DURING THE QUARTER</td></tr>
                <tr><td colSpan={2}>SCHEDULE 2 - INPUT TAX ATTRIBUTABLE TO VAT EXEMPT SALES</td></tr>
            </T>
            <T>
                <tr><td>INPUT TAX DIRECTLY ATTRIBUTABLE TO VAT EXEMPT SALE</td><td className="bf-w25"><Num k={`${V}sched2InputTaxDirect`} /></td></tr>
                <tr>
                    <td>
                        <div className="bf-gap">ADD: RATABLE PORTION OF INPUT TAX NOT DIRECTLY ATTRIBUTABLE TO ANY ACTIVITY:</div>
                        <div className="bf-grid4">
                            <span>VAT EXEMPT SALE</span><Num k={`${V}sched2VatExemptSale`} ro />
                            <span>AMOUNT OF INPUT TAX NOT DIRECTLY ATTRIBUTABLE</span><Num k={`${V}sched2AmountInputTax`} />
                            <span>TOTAL SALES</span><Num k={`${V}sched2TotalSales`} ro />
                        </div>
                    </td>
                    <td><Num k={`${V}sched2TotalRatable`} ro /></td>
                </tr>
                <tr><td>TOTAL INPUT TAX ATTRIBUTABLE TO EXEMPT SALE (TO PART IV, ITEM 53)</td><td><Num k={`${V}sched2TotalAttr`} ro /></td></tr>
                <tr><td colSpan={2}>SCHEDULE 3 - CREDITABLE VAT WITHHELD (ATTACH ADDITIONAL SHEET/S IF NECESSARY) (SCH. 3)</td></tr>
            </T>
            <Sched3 />
            <T>
                <tr className="bf-c"><td>(A) PERIOD COVERED</td><td>(B) NAME OF MILLER</td><td>(C) NAME OF TAXPAYER</td><td>(D) OFFICIAL RECEIPT NUMBER</td><td>(E) AMOUNT PAID</td></tr>
                {[0, 1].map((i) => (
                    <tr key={i}>
                        <td><div className="bf-two"><Txt k={`txtDate4${i}`} c /><Txt k={`txtDate4To${i}`} c /></div></td>
                        <td><Txt k={`txtNameOfMiller4${i}`} ro /></td>
                        <td><Txt k={`txtNameOfTaxpayer4${i}`} ro /></td>
                        <td><Txt k={`txtOfficialReceiptNumber4${i}`} ro /></td>
                        <td><Num k={`txtAmountPaid4${i}`} ro /></td>
                    </tr>
                ))}
                <tr><td colSpan={4}>TOTAL (TO PART II, ITEM 17)</td><td><Num k="sched4AmountPaid" ro /></td></tr>
                <tr><td colSpan={5} className="bf-sm">{NOTE_B}</td></tr>
            </T>
        </>
    );
}

/* =========================================================
   2551Q (v2018) – 2 pages
   ========================================================= */
const P = "frm2551Qv2018:";
const pLine = (no, label, k, ro, other) => <Line key={no} no={no} label={label} k={`${P}${k}`} ro={ro} other={other ? `${P}${other}` : undefined} />;

function L2551Q_1() {
    return (
        <>
            <T>
                <tr>
                    <td><Cell><No n="1" />FOR THE<Opts group={[`${P}forThe_1`, `${P}forThe_2`]} labels={["CALENDAR", "FISCAL"]} /></Cell></td>
                    <td><No n="3" />QUARTER</td><td><No n="4" />AMENDED RETURN ?</td><td><No n="5" />NO. OF SHEET/S ATTACHED</td>
                </tr>
                <tr>
                    <td><Cell><No n="2" />YEAR ENDED (MM/YYYY)<MonthF parts={[[`${P}rtnMonth`, "mn"], [`${P}txtYear`, "y"]]} /></Cell></td>
                    <td><Opts group={[1, 2, 3, 4].map((i) => `${P}qtr_${i}`)} labels={Q4} /></td>
                    <td><Opts group={[`${P}amendedRtn_1`, `${P}amendedRtn_2`]} labels={YN} /></td>
                    <td><Txt k={`${P}txtSheets`} c /></td>
                </tr>
            </T>
            <T>
                <H span={4}>PART I - BACKGROUND INFORMATION</H>
                <tr>
                    <td><No n="6" />TAXPAYER IDENTIFICATION NUMBER (TIN)</td>
                    <td><Tin keys={[`${P}txtTIN1`, `${P}txtTIN2`, `${P}txtTIN3`, `${P}txtBranchCode`]} /></td>
                    <td className="bf-r"><No n="7" />RDO CODE</td>
                    <td><Txt k={`${P}txtRDOCode`} /></td>
                </tr>
                <tr><td colSpan={4}><No n="8" />TAXPAYER'S NAME (LAST NAME, FIRST NAME, MIDDLE NAME FOR INDIVIDUAL OR REGISTERED NAME FOR NON-INDIVIDUAL)</td></tr>
                <tr><td colSpan={4}><Txt k={`${P}registeredName`} /></td></tr>
                <tr><td colSpan={4} className="bf-wrap-text"><No n="9" />REGISTERED ADDRESS (INDICATE COMPLETE ADDRESS. IF BRANCH, INDICATE THE BRANCH ADDRESS. IF THE REGISTERED ADDRESS IS DIFFERENT FROM THE CURRENT ADDRESS, GO TO THE RDO TO UPDATE REGISTERED ADDRESS BY USING BIR FORM NO. 1905)</td></tr>
                <tr>
                    <td colSpan={2}><Txt k={`${P}registeredAddress`} /></td>
                    <td><No n="9A" />ZIP CODE</td>
                    <td><Txt k={`${P}zipCode`} /></td>
                </tr>
            </T>
            <T>
                <tr><td className="bf-w35"><No n="10" />CONTACT NUMBER (LANDLINE/CELLPHONE NO.)</td><td><No n="11" />EMAIL ADDRESS</td></tr>
                <tr><td><Txt k={`${P}telNo`} /></td><td><Txt k="txtEmail" /></td></tr>
            </T>
            <T>
                <tr>
                    <td className="bf-wrap-text"><No n="12" />ARE YOU AVAILING OF TAX RELIEF UNDER SPECIAL LAW / INTERNATIONAL TAX TREATY?</td>
                    <td className="bf-c"><Opts group={[`${P}taxTreaty_1`, `${P}taxTreaty_2`]} labels={YN} /></td>
                    <td><Cell><span className="bf-lbl"><No n="12A" />IF YES, SPECIFY</span><Sel k={`${P}txtTaxReliefSpecify`} options={TREATY} /></Cell></td>
                </tr>
            </T>
            <T>
                <tr><td colSpan={2}><No n="13" />Only for individual taxpayers whose sales/receipts are subject to Percentage Tax under section 116 of the Tax Code, as amended:</td></tr>
                <tr><td colSpan={2}>What income tax rates are you availing? (choose one)</td></tr>
                <tr>
                    <td>(To be filled out only on the initial quarter of the taxable year)</td>
                    <td><Opts group={[`${P}taxRate1`, `${P}taxRate2`]} labels={["Graduated income tax rate on net taxable income", "8% income tax rate on gross sales/receipts/others"]} /></td>
                </tr>
            </T>
            <T>
                <H span={3}>PART II - TOTAL TAX PAYABLE</H>
                {pLine("14", "TOTAL TAX DUE (FROM SCHEDULE 1 ITEM 7)", "txt14", true)}
                <tr><td colSpan={3}>LESS: TAX CREDIT/PAYMENT (ATTACH PROOF)</td></tr>
                {pLine("15", "CREDITABLE PERCENTAGE TAX WITHHELD PER BIR FORM NO. 2307", "txt15", true)}
                {pLine("16", "TAX PAID IN RETURN PREVIOUSLY FILED, IF THIS IS AN AMENDED RETURN", "txt16", true)}
                {pLine("17", "OTHER TAX CREDITS/PAYMENT (SPECIFY)", "txt17", true, "txt17Specify")}
                {pLine("18", "TOTAL TAX CREDITS/PAYMENTS (SUM OF ITEMS 15 TO 17)", "txt18", true)}
                {pLine("19", "TAX STILL PAYABLE/(OVERPAYMENT) (ITEM 14 LESS ITEM 18)", "txt19", true)}
                <tr><td colSpan={3}>ADD PENALTIES</td></tr>
                {pLine("20", "SURCHARGE", "txt20")}
                {pLine("21", "INTEREST", "txt21")}
                {pLine("22", "COMPROMISE", "txt22")}
                {pLine("23", "TOTAL PENALTIES (SUM OF ITEMS 20 TO 22)", "txt23", true)}
                {pLine("24", "TOTAL AMOUNT PAYABLE/(OVERPAYMENT) (SUM OF ITEMS 19 AND 23)", "txt24", true)}
            </T>
            <T>
                <tr>
                    <td>IF OVERPAYMENT, MARK ONE BOX ONLY:</td>
                    <td><Opts group={[`${P}overPayment1`, `${P}overPayment2`]} labels={["TO BE REFUNDED", "TO BE ISSUED A TAX CREDIT CERTIFICATE"]} /></td>
                </tr>
            </T>
            <Declaration agent="txtTaxAgentNo" issue="txtDateIssue" expiry="txtDateExpiry" />
            <Payment
                rows={[["27", "CASH/BANK DEBIT ADVICE", payKeys(P, 25)], ["28", "CHECK", payKeys(P, 26)], ["29", "TAX DEBIT MEMO", payKeys(P, 27)]]}
                other={["30", { p: `${P}txtParticular28`, ...payKeys(P, 28) }]}
            />
            <Note text={NOTE_B} />
        </>
    );
}

// ATC select also fills that row's tax rate
function AtcSel({ i }) {
    const { vals, apply, lookups } = useB();
    const list = lookups?.atc2551q || [];
    const k = `drpATC${i}`;
    return (
        <select
            className="input bf-in"
            value={vals[k] || "0"}
            onChange={(e) => {
                const row = list.find((x) => String(x.id) === e.target.value);
                apply({ [k]: e.target.value, [`txtATCRate${i}`]: row ? (Number(row.tax_rate) * 100).toFixed(2) : "" });
            }}
        >
            <option value="0">&nbsp;</option>
            {list.map((o) => <option key={o.id} value={String(o.id)}>{o.atc}</option>)}
        </select>
    );
}

const SEC_BEFORE = {
    "PT 105": [
        ["Tax on Banks and Non-Bank Financial Intermediaries Performing Quasi-Banking Functions (Sec. 121)", true],
        ["1) On interest, commissions and discounts from lending activities as well as income from financial leasing, on the basis of remaining maturities of instruments from which such receipts are derived", false],
    ],
    "PT 113": [
        ["Tax on Other Non-Bank Financial Intermediaries not Performing Quasi-Banking Functions (Sec. 122)", true],
        ["1) On interest, commissions and discounts from lending activities as well as income from financial leasing, on the basis of remaining maturities of instruments from which such receipts are derived", false],
    ],
    "PT 130": [["Agents of Foreign Insurance Companies (Sec. 124)", true]],
};

function L2551Q_2() {
    const { lookups } = useB();
    const list = lookups?.atc2551q || [];
    return (
        <>
            <T>
                <tr><td className="bf-w35">TIN</td><td>TAXPAYER'S LAST NAME (IF INDIVIDUAL) / REGISTERED NAME (IF NON-INDIVIDUAL)</td></tr>
                <tr>
                    <td><Tin keys={[`${P}txtPg2TIN1`, `${P}txtPg2TIN2`, `${P}txtPg2TIN3`, `${P}txtPg2BranchCode`]} /></td>
                    <td><Txt k={`${P}txtPg2TaxpayerName`} ro /></td>
                </tr>
            </T>
            <T>
                <tr><td colSpan={5}>Schedule 1 - Computation of Tax (Attach additional sheet/s, if necessary)</td></tr>
                <tr className="bf-c"><td colSpan={2}>ALPHANUMERIC TAX CODE (ATC)</td><td>TAXABLE AMOUNT</td><td>TAX RATE</td><td>TAX DUE</td></tr>
                {[1, 2, 3, 4, 5, 6].map((i) => (
                    <tr key={i}>
                        <td className="bf-c bf-w4">{i}</td>
                        <td><AtcSel i={i} /></td>
                        <td><Num k={`txtATCAmt${i}`} /></td>
                        <td><Txt k={`txtATCRate${i}`} ro r /></td>
                        <td><Num k={`txtATCDue${i}`} ro /></td>
                    </tr>
                ))}
                <tr><td colSpan={4}>7 TOTAL TAX DUE (SUM OF ITEMS 1 TO 6) (TO PART II ITEM 14)</td><td><Num k="txtTotalSched1" ro /></td></tr>
            </T>
            <T>
                <tr><td colSpan={3}>TABLE 1 - ALPHANUMERIC TAX CODE (ATC)</td></tr>
                <tr className="bf-c"><td className="bf-w10">ATC</td><td>PERCENTAGE TAX ON</td><td className="bf-w10">TAX RATE</td></tr>
                {list.flatMap((x) => [
                    ...(SEC_BEFORE[x.atc] || []).map(([text, bold], j) => (
                        <tr key={`${x.id}-h${j}`}>{bold ? <td colSpan={3} className="bf-wrap-text"><b>{text}</b></td> : <><td /><td colSpan={2} className="bf-wrap-text">{text}</td></>}</tr>
                    )),
                    <tr key={x.id}>
                        <td className="bf-c">{x.atc}</td>
                        <td className="bf-wrap-text">{x.description}</td>
                        <td className="bf-c">{Math.round(Number(x.tax_rate) * 100)}%</td>
                    </tr>,
                ])}
            </T>
        </>
    );
}

/* =========================================================
   registry
   ========================================================= */
/* =========================================================
   NEW FORMS (FEMS design that follows the BIR form)
   1701Q · 1701 · 1702Q · 1702RT · 1702EX · 1604C · 1604E · 2200M
   ========================================================= */
const MONTHS_UP = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];
const DECL_ITR = "I/WE DECLARE UNDER THE PENALTIES OF PERJURY THAT THIS RETURN, AND ALL ITS ATTACHMENTS, HAVE BEEN MADE IN GOOD FAITH, VERIFIED BY ME/US, AND TO THE BEST OF MY/OUR KNOWLEDGE AND BELIEF, ARE TRUE AND CORRECT, PURSUANT TO THE PROVISIONS OF THE NATIONAL INTERNAL REVENUE CODE, AS AMENDED, AND THE REGULATIONS ISSUED UNDER AUTHORITY THEREOF. FURTHER, I/WE GIVE MY/OUR CONSENT TO THE PROCESSING OF MY/OUR INFORMATION AS CONTEMPLATED UNDER THE *DATA PRIVACY ACT OF 2012 (R.A. NO. 10173) FOR LEGITIMATE AND LAWFUL PURPOSES. (IF AUTHORIZED REPRESENTATIVE, ATTACH AUTHORIZATION LETTER)";
const DECL_INFO = "I/WE DECLARE UNDER THE PENALTIES OF PERJURY THAT THIS ANNUAL INFORMATION RETURN, AND ALL ITS ATTACHMENTS, HAVE BEEN MADE IN GOOD FAITH, VERIFIED BY ME/US, AND TO THE BEST OF MY/OUR KNOWLEDGE AND BELIEF, ARE TRUE AND CORRECT, PURSUANT TO THE PROVISIONS OF THE NATIONAL INTERNAL REVENUE CODE, AS AMENDED, AND THE REGULATIONS ISSUED UNDER AUTHORITY THEREOF. FURTHER, I/WE GIVE MY/OUR CONSENT TO THE PROCESSING OF MY/OUR INFORMATION AS CONTEMPLATED UNDER THE *DATA PRIVACY ACT OF 2012 (R.A. NO. 10173) FOR LEGITIMATE AND LAWFUL PURPOSES. (IF AUTHORIZED REPRESENTATIVE, ATTACH AUTHORIZATION LETTER)";

// BIR form header band: form no. on the left, title in the middle
function FormHead({ no, title, sub, month }) {
    return (
        <T>
            <tr>
                <td className="bf-w20 bf-c">
                    <div className="bf-sm">BIR FORM NO.</div>
                    <div style={{ fontSize: 26, fontWeight: 800, lineHeight: 1.1, letterSpacing: ".02em" }}>{no}</div>
                    {month && <div className="bf-sm">{month}</div>}
                </td>
                <td className="bf-c bf-wrap-text">
                    <div style={{ fontSize: 15, fontWeight: 800, letterSpacing: ".03em" }}>{title}</div>
                    {sub && <div className="bf-sm bf-wrap-text" style={{ marginTop: 4 }}>{sub}</div>}
                </td>
                <td className="bf-w15 bf-c bf-sm bf-wrap-text">FEMS COPY<br />(NOT AN eBIRForms FILE)</td>
            </tr>
        </T>
    );
}

// TIN · RDO · name · address · ZIP · contact · email (· line of business)
function Bg({ X, n, agent = false, lob = true }) {
    const no = (i) => String(n + i);
    return (
        <>
            <T>
                <H span={4}>PART I - BACKGROUND INFORMATION</H>
                <tr>
                    <td className="bf-w20"><No n={no(0)} />TAXPAYER IDENTIFICATION NUMBER (TIN)</td>
                    <td><Tin keys={[`${X}txtTIN1`, `${X}txtTIN2`, `${X}txtTIN3`, `${X}txtBranchCode`]} /></td>
                    <td className="bf-w10 bf-r"><No n={no(1)} />RDO CODE</td>
                    <td className="bf-w10"><Txt k={`${X}txtRDOCode`} /></td>
                </tr>
            </T>
            <T>
                <tr>
                    <td colSpan={3} className="bf-wrap-text">
                        <No n={no(2)} />{agent ? "WITHHOLDING AGENT'S NAME" : "TAXPAYER'S NAME"} (LAST NAME, FIRST NAME, MIDDLE NAME FOR INDIVIDUALS) / (REGISTERED NAME FOR NON-INDIVIDUALS)
                    </td>
                </tr>
                <tr><td colSpan={3}><Txt k={`${X}txtTaxpayerName`} /></td></tr>
                <tr><td colSpan={3} className="bf-wrap-text"><No n={no(3)} />REGISTERED ADDRESS (INDICATE COMPLETE ADDRESS. IF BRANCH, INDICATE THE BRANCH ADDRESS)</td></tr>
                <tr><td colSpan={3}><Txt k={`${X}txtAddress`} /></td></tr>
                <tr>
                    <td className="bf-w70"><Free ro /></td>
                    <td className="bf-w15 bf-r"><No n={`${no(3)}A`} />ZIP CODE</td>
                    <td className="bf-w15"><Txt k={`${X}txtZipCode`} /></td>
                </tr>
            </T>
            <T>
                <tr>
                    <td className="bf-w15"><No n={no(4)} />CONTACT NUMBER</td><td className="bf-w25"><Txt k={`${X}txtTelNum`} /></td>
                    <td className="bf-w15"><No n={no(5)} />EMAIL ADDRESS</td><td><Txt k={`${X}txtEmail`} /></td>
                </tr>
                {lob && <tr><td><No n={no(6)} />LINE OF BUSINESS</td><td colSpan={3}><Txt k={`${X}txtLineBus`} /></td></tr>}
            </T>
        </>
    );
}

// Part II: tax due → credits → payable → penalties → total
function PartII({ X, n, title = "PART II - TOTAL TAX PAYABLE", dueLabel, creditsLabel }) {
    const no = (i) => String(n + i);
    return (
        <>
            <T>
                <H span={3}>{title}</H>
                <Line no={no(0)} label={dueLabel || "TAX DUE"} k={`${X}taxDue`} ro wrap />
                <Line no={no(1)} label={creditsLabel || "LESS: TOTAL TAX CREDITS/PAYMENTS"} k={`${X}credits`} ro wrap />
                <Line no={no(2)} label={`TAX PAYABLE/(OVERPAYMENT) (ITEM ${no(0)} LESS ITEM ${no(1)})`} k={`${X}payable`} ro />
                <tr><td colSpan={3}><No n={no(3)} />ADD: PENALTIES</td></tr>
            </T>
            <Penalties nos={[`${no(3)}A`, `${no(3)}B`, `${no(3)}C`, `${no(3)}D`]} keys={[`${X}surcharge`, `${X}interest`, `${X}compromise`, `${X}penalties`]} />
            <T><Line no={no(4)} label={`TOTAL AMOUNT PAYABLE/(OVERPAYMENT) (SUM OF ITEMS ${no(2)} AND ${no(3)}D)`} k={`${X}total`} ro /></T>
        </>
    );
}

function OverPay({ X }) {
    return (
        <T cls="bf-mt">
            <tr>
                <td className="bf-wrap-text">IF OVERPAYMENT, MARK ONE (1) BOX ONLY</td>
                <td className="bf-c"><Chk k={`${X}chkRefund`} label="TO BE REFUNDED" /></td>
                <td className="bf-c"><Chk k={`${X}chkTcc`} label="TO BE ISSUED A TAX CREDIT CERTIFICATE" /></td>
                <td className="bf-c"><Chk k={`${X}chkCarry`} label="TO BE CARRIED OVER AS A TAX CREDIT FOR NEXT YEAR/QUARTER" /></td>
            </tr>
        </T>
    );
}

function PayPart({ X, n }) {
    const no = (i) => String(n + i);
    return (
        <>
            <Declaration text={DECL_ITR} agent="txtTaxAgentNo" issue="txtDateIssue" expiry="txtDateExpiry" />
            <Payment
                rows={[[no(0), "CASH/BANK DEBIT MEMO", payKeys(X, "P1")], [no(1), "CHECK", payKeys(X, "P2")], [no(2), "TAX DEBIT MEMO", payKeys(X, "P3")]]}
                other={[no(3), { p: `${X}txtParticularP4`, ...payKeys(X, "P4") }]}
            />
            <Note />
        </>
    );
}

// label | item | amount, with a prefix (one schedule line)
const lineOf = (X) => (no, label, k, ro, other, wrap = true) =>
    <Line key={no} no={no} label={label} k={`${X}${k}`} ro={ro} other={other ? `${X}${other}` : undefined} wrap={wrap} />;

/* ---------- 1701Q ---------- */
const IQ = "frm1701q:";
function L1701Q_1() {
    return (
        <>
            <FormHead no="1701Q" month="JANUARY 2018 (ENCS)" title="QUARTERLY INCOME TAX RETURN"
                sub="FOR INDIVIDUALS, ESTATES AND TRUSTS" />
            <T>
                <tr>
                    <td><No n="1" />FOR THE YEAR (YYYY)</td><td><No n="2" />QUARTER</td><td><No n="3" />AMENDED RETURN?</td><td><No n="4" />NO. OF SHEETS ATTACHED</td>
                </tr>
                <tr>
                    <td><Txt k={`${IQ}txtYear`} c /></td>
                    <td><Opts group={[1, 2, 3].map((i) => `${IQ}optQuarter:${i}`)} labels={["1ST", "2ND", "3RD"]} /></td>
                    <td><Opts group={[`${IQ}optAmend:Y`, `${IQ}optAmend:N`]} labels={YN} /></td>
                    <td><Txt k={`${IQ}txtSheets`} c /></td>
                </tr>
            </T>
            <Bg X={IQ} n={5} />
            <T>
                <tr>
                    <td><No n="12" />TAXPAYER TYPE</td>
                    <td colSpan={3}><Opts group={["SP", "PR", "ES", "TR"].map((t) => `${IQ}optType:${t}`)} labels={["SINGLE PROPRIETOR", "PROFESSIONAL", "ESTATE", "TRUST"]} /></td>
                </tr>
                <tr>
                    <td><No n="13" />ATC</td><td><Txt k={`${IQ}txtATC`} c /></td>
                    <td><No n="14" />DATE OF BIRTH (MM/DD/YYYY)</td><td><Txt k={`${IQ}txtBirthDate`} c /></td>
                </tr>
                <tr>
                    <td><No n="15" />CITIZENSHIP</td><td><Txt k={`${IQ}txtCitizenship`} /></td>
                    <td><No n="16" />FOREIGN TAX NUMBER (IF APPLICABLE)</td><td><Txt k={`${IQ}txtForeignTin`} /></td>
                </tr>
                <tr>
                    <td className="bf-wrap-text"><No n="17" />TAX RATE</td>
                    <td colSpan={3}><Opts group={[`${IQ}optRate:G`, `${IQ}optRate:E`]} labels={["GRADUATED INCOME TAX RATES", "8% INCOME TAX RATE (IN LIEU OF GRADUATED RATES AND PERCENTAGE TAX)"]} /></td>
                </tr>
                <tr>
                    <td className="bf-wrap-text"><No n="17A" />METHOD OF DEDUCTION (GRADUATED RATES ONLY)</td>
                    <td colSpan={3}><Opts group={[`${IQ}optDeduct:I`, `${IQ}optDeduct:O`]} labels={["ITEMIZED DEDUCTIONS", "OPTIONAL STANDARD DEDUCTION (OSD) – 40% OF GROSS SALES/RECEIPTS"]} /></td>
                </tr>
            </T>
            <PartII X={IQ} n={18} dueLabel="TAX DUE (FROM SCHEDULE I ITEM 47 OR SCHEDULE II ITEM 55)" creditsLabel="LESS: TAX CREDITS/PAYMENTS (FROM SCHEDULE III ITEM 63)" />
            <PayPart X={IQ} n={23} />
        </>
    );
}
function L1701Q_2() {
    const l = lineOf(IQ);
    return (
        <>
            <T>
                <tr><td className="bf-w35">TIN</td><td>TAXPAYER'S NAME</td></tr>
                <tr><td><Tin keys={[`${IQ}txtTIN1`, `${IQ}txtTIN2`, `${IQ}txtTIN3`, `${IQ}txtBranchCode`]} /></td><td><Txt k={`${IQ}txtTaxpayerName`} ro /></td></tr>
            </T>
            <T>
                <H span={3}>SCHEDULE I - FOR GRADUATED INCOME TAX RATES</H>
                {l("37", "SALES/REVENUES/RECEIPTS/FEES (NET OF SALES RETURNS, ALLOWANCES AND DISCOUNTS)", "s1Sales")}
                {l("38", "LESS: COST OF SALES/SERVICES (IF AVAILING OF ITEMIZED DEDUCTIONS)", "s1Cost")}
                {l("39", "GROSS INCOME/(LOSS) FROM OPERATIONS (ITEM 37 LESS ITEM 38)", "s1Gross", true)}
                {l("40", "TOTAL ALLOWABLE ITEMIZED DEDUCTIONS", "s1Itemized")}
                {l("41", "OPTIONAL STANDARD DEDUCTION (OSD) (40% OF ITEM 37)", "s1Osd", true)}
                {l("42", "NET INCOME/(LOSS) THIS QUARTER (ITEM 39 LESS ITEM 40, OR ITEM 37 LESS ITEM 41 IF OSD)", "s1Net", true)}
                {l("43", "ADD: TAXABLE INCOME/(LOSS) PREVIOUS QUARTER/S", "s1Prev")}
                {l("44", "NON-OPERATING INCOME (SPECIFY)", "s1NonOp")}
                {l("45", "AMOUNT RECEIVED/SHARE IN INCOME BY A PARTNER FROM GENERAL PROFESSIONAL PARTNERSHIP (GPP)", "s1Partner")}
                {l("46", "TOTAL TAXABLE INCOME/(LOSS) TO DATE (SUM OF ITEMS 42 TO 45)", "s1Taxable", true)}
                {l("47", "TAX DUE (ITEM 46 X APPLICABLE TAX RATE BASED ON TAX TABLE)", "s1Due", true)}
            </T>
            <T>
                <H span={3}>SCHEDULE II - FOR 8% INCOME TAX RATE</H>
                {l("48", "SALES/REVENUES/RECEIPTS/FEES (NET OF SALES RETURNS, ALLOWANCES AND DISCOUNTS)", "s2Sales")}
                {l("49", "ADD: NON-OPERATING INCOME (SPECIFY)", "s2NonOp")}
                {l("50", "TOTAL INCOME FOR THE QUARTER (SUM OF ITEMS 48 AND 49)", "s2Total", true)}
                {l("51", "ADD: TOTAL TAXABLE INCOME/(LOSS) PREVIOUS QUARTER/S", "s2Prev")}
                {l("52", "CUMULATIVE TAXABLE INCOME/(LOSS) AS OF THIS QUARTER (SUM OF ITEMS 50 AND 51)", "s2Cum", true)}
                {l("53", "LESS: ALLOWABLE REDUCTION FROM GROSS SALES/RECEIPTS AND OTHER NON-OPERATING INCOME OF PURELY SELF-EMPLOYED INDIVIDUALS AND/OR PROFESSIONALS IN THE AMOUNT OF ₱250,000", "s2Less")}
                {l("54", "TAXABLE INCOME/(LOSS) TO DATE (ITEM 52 LESS ITEM 53)", "s2Taxable", true)}
                {l("55", "TAX DUE (ITEM 54 X 8% TAX RATE)", "s2Due", true)}
            </T>
            <T>
                <H span={3}>SCHEDULE III - TAX CREDITS/PAYMENTS</H>
                {l("56", "PRIOR YEAR'S EXCESS CREDITS", "s3Prior")}
                {l("57", "TAX PAYMENT/S FOR THE PREVIOUS QUARTER/S", "s3PrevPay")}
                {l("58", "CREDITABLE TAX WITHHELD FOR THE PREVIOUS QUARTER/S", "s3PrevCwt")}
                {l("59", "CREDITABLE TAX WITHHELD PER BIR FORM NO. 2307 FOR THIS QUARTER", "s3Cwt")}
                {l("60", "TAX PAID IN RETURN PREVIOUSLY FILED, IF THIS IS AN AMENDED RETURN", "s3Filed")}
                {l("61", "FOREIGN TAX CREDITS, IF APPLICABLE", "s3Foreign")}
                {l("62", "OTHER TAX CREDITS/PAYMENTS (SPECIFY)", "s3Other", false, "s3OtherSpecify")}
                {l("63", "TOTAL TAX CREDITS/PAYMENTS (SUM OF ITEMS 56 TO 62)", "s3Total", true)}
            </T>
        </>
    );
}

/* ---------- 1701 ---------- */
const IA = "frm1701:";
function L1701_1() {
    return (
        <>
            <FormHead no="1701" month="JANUARY 2018 (ENCS)" title="ANNUAL INCOME TAX RETURN"
                sub="INDIVIDUALS (INCLUDING MIXED INCOME EARNER), ESTATES AND TRUSTS" />
            <T>
                <tr><td><No n="1" />FOR THE YEAR (YYYY)</td><td><No n="2" />AMENDED RETURN?</td><td><No n="3" />SHORT PERIOD RETURN?</td><td><No n="4" />NO. OF SHEETS ATTACHED</td></tr>
                <tr>
                    <td><Txt k={`${IA}txtYear`} c /></td>
                    <td><Opts group={[`${IA}optAmend:Y`, `${IA}optAmend:N`]} labels={YN} /></td>
                    <td><Opts group={[`${IA}optShort:Y`, `${IA}optShort:N`]} labels={YN} /></td>
                    <td><Txt k={`${IA}txtSheets`} c /></td>
                </tr>
            </T>
            <Bg X={IA} n={5} />
            <T>
                <tr>
                    <td><No n="12" />TAXPAYER TYPE</td>
                    <td colSpan={3}><Opts group={["SP", "PR", "ES", "TR", "CE"].map((t) => `${IA}optType:${t}`)} labels={["SINGLE PROPRIETOR", "PROFESSIONAL", "ESTATE", "TRUST", "COMPENSATION EARNER"]} /></td>
                </tr>
                <tr>
                    <td><No n="13" />ATC</td><td><Txt k={`${IA}txtATC`} c /></td>
                    <td><No n="14" />DATE OF BIRTH (MM/DD/YYYY)</td><td><Txt k={`${IA}txtBirthDate`} c /></td>
                </tr>
                <tr>
                    <td><No n="15" />CITIZENSHIP</td><td><Txt k={`${IA}txtCitizenship`} /></td>
                    <td><No n="16" />FOREIGN TAX NUMBER (IF APPLICABLE)</td><td><Txt k={`${IA}txtForeignTin`} /></td>
                </tr>
                <tr>
                    <td><No n="17" />TAX RATE (BUSINESS/PROFESSION)</td>
                    <td colSpan={3}><Opts group={[`${IA}optRate:G`, `${IA}optRate:E`]} labels={["GRADUATED INCOME TAX RATES", "8% INCOME TAX RATE (IN LIEU OF GRADUATED RATES AND PERCENTAGE TAX)"]} /></td>
                </tr>
                <tr>
                    <td className="bf-wrap-text"><No n="17A" />METHOD OF DEDUCTION (GRADUATED RATES ONLY)</td>
                    <td colSpan={3}><Opts group={[`${IA}optDeduct:I`, `${IA}optDeduct:O`]} labels={["ITEMIZED DEDUCTIONS", "OPTIONAL STANDARD DEDUCTION (OSD) – 40% OF GROSS SALES/RECEIPTS"]} /></td>
                </tr>
            </T>
            <PartII X={IA} n={18} dueLabel="TAX DUE (FROM PART IV-A ITEM 12 OR PART IV-B ITEM 8)" creditsLabel="LESS: TOTAL TAX CREDITS/PAYMENTS (FROM PART IV-C ITEM 10)" />
            <OverPay X={IA} />
            <PayPart X={IA} n={23} />
        </>
    );
}
function L1701_2() {
    const l = lineOf(IA);
    return (
        <>
            <T>
                <tr><td className="bf-w35">TIN</td><td>TAXPAYER'S NAME</td></tr>
                <tr><td><Tin keys={[`${IA}txtTIN1`, `${IA}txtTIN2`, `${IA}txtTIN3`, `${IA}txtBranchCode`]} /></td><td><Txt k={`${IA}txtTaxpayerName`} ro /></td></tr>
            </T>
            <T>
                <H span={3}>PART III - COMPENSATION INCOME (FROM BIR FORM NO. 2316)</H>
                {l("1", "GROSS COMPENSATION INCOME", "compGross")}
                {l("2", "LESS: NON-TAXABLE/EXEMPT COMPENSATION (13TH MONTH & OTHER BENEFITS, DE MINIMIS, SSS/PHIC/HDMF, MWE PAY)", "compNonTax")}
                {l("3", "TAXABLE COMPENSATION INCOME (ITEM 1 LESS ITEM 2)", "compTaxable", true)}
                {l("4", "TAX WITHHELD ON COMPENSATION (TO PART IV-C ITEM 5)", "compWithheld")}
            </T>
            <T>
                <H span={3}>PART IV-A - GRADUATED INCOME TAX RATES</H>
                {l("1", "SALES/REVENUES/RECEIPTS/FEES (NET OF SALES RETURNS, ALLOWANCES AND DISCOUNTS)", "aSales")}
                {l("2", "LESS: COST OF SALES/SERVICES (IF AVAILING OF ITEMIZED DEDUCTIONS)", "aCost")}
                {l("3", "GROSS INCOME/(LOSS) FROM OPERATIONS (ITEM 1 LESS ITEM 2)", "aGross", true)}
                {l("4", "ADD: OTHER TAXABLE INCOME/(LOSS) – NON-OPERATING", "aNonOp")}
                {l("5", "TOTAL GROSS INCOME (SUM OF ITEMS 3 AND 4)", "aTotalGross", true)}
                {l("6", "LESS: ALLOWABLE ITEMIZED DEDUCTIONS", "aItemized")}
                {l("7", "OPTIONAL STANDARD DEDUCTION (40% OF GROSS SALES/RECEIPTS AND OTHER NON-OPERATING INCOME)", "aOsd", true)}
                {l("8", "NET INCOME/(LOSS) FROM BUSINESS/PROFESSION", "aNet", true)}
                {l("9", "ADD: SHARE IN THE NET INCOME OF A GENERAL PROFESSIONAL PARTNERSHIP", "aPartner")}
                {l("10", "ADD: TAXABLE COMPENSATION INCOME (FROM PART III ITEM 3)", "compTaxable", true)}
                {l("11", "TOTAL TAXABLE INCOME/(LOSS) (SUM OF ITEMS 8 TO 10)", "aTaxable", true)}
                {l("12", "TAX DUE – GRADUATED RATES (BASED ON THE TAX TABLE)", "aDue", true)}
            </T>
            <T>
                <H span={3}>PART IV-B - 8% INCOME TAX RATE</H>
                {l("1", "SALES/REVENUES/RECEIPTS/FEES (NET OF SALES RETURNS, ALLOWANCES AND DISCOUNTS)", "bSales")}
                {l("2", "ADD: NON-OPERATING INCOME", "bNonOp")}
                {l("3", "TOTAL INCOME (SUM OF ITEMS 1 AND 2)", "bTotal", true)}
                {l("4", "LESS: ALLOWABLE REDUCTION OF ₱250,000 (PURELY SELF-EMPLOYED / PROFESSIONALS ONLY; NOT FOR MIXED INCOME EARNERS)", "bLess")}
                {l("5", "TAXABLE INCOME (ITEM 3 LESS ITEM 4)", "bTaxable", true)}
                {l("6", "TAX DUE – 8% OF ITEM 5", "bDue", true)}
                {l("7", "ADD: TAX DUE ON TAXABLE COMPENSATION (GRADUATED RATES)", "bCompDue", true)}
                {l("8", "TOTAL TAX DUE (SUM OF ITEMS 6 AND 7)", "bTotalDue", true)}
            </T>
            <T>
                <H span={3}>PART IV-C - TAX CREDITS/PAYMENTS</H>
                {l("1", "PRIOR YEAR'S EXCESS CREDITS", "cPrior")}
                {l("2", "TAX PAYMENTS FOR THE FIRST THREE (3) QUARTERS (BIR FORM NO. 1701Q)", "cQuarterly")}
                {l("3", "CREDITABLE TAX WITHHELD FOR THE FIRST THREE (3) QUARTERS (BIR FORM NO. 2307)", "cCwtQ13")}
                {l("4", "CREDITABLE TAX WITHHELD PER BIR FORM NO. 2307 FOR THE 4TH QUARTER", "cCwtQ4")}
                {l("5", "TAX WITHHELD ON COMPENSATION (BIR FORM NO. 2316)", "cComp", true)}
                {l("6", "TAX PAID IN RETURN PREVIOUSLY FILED, IF THIS IS AN AMENDED RETURN", "cFiled")}
                {l("7", "FOREIGN TAX CREDITS, IF APPLICABLE", "cForeign")}
                {l("8", "OTHER TAX CREDITS/PAYMENTS (SPECIFY)", "cOther", false, "cOtherSpecify")}
                {l("10", "TOTAL TAX CREDITS/PAYMENTS (SUM OF ITEMS 1 TO 8)", "cTotal", true)}
            </T>
        </>
    );
}

/* ---------- 1702Q / 1702RT / 1702EX (corporations) ---------- */
function CorpTop({ X, n0 = 1, quarter = false, short = false }) {
    return (
        <T>
            <tr>
                <td className="bf-w30"><Cell><No n="1" />FOR THE<Opts group={[`${X}optFor:C`, `${X}optFor:F`]} labels={["CALENDAR", "FISCAL"]} /></Cell></td>
                <td className="bf-w20"><No n="2" />YEAR ENDED (MM/YYYY)</td>
                <td className="bf-w20"><MonthF parts={[[`${X}txtYearEndMonth`, "m"], [`${X}txtYearEndYear`, "y"]]} /></td>
                <td>
                    {quarter
                        ? <Cell><No n="3" />QUARTER<Opts group={[1, 2, 3].map((i) => `${X}optQuarter:${i}`)} labels={["1ST", "2ND", "3RD"]} /></Cell>
                        : <Cell><No n="3" />NO. OF SHEETS<Txt k={`${X}txtSheets`} c /></Cell>}
                </td>
            </tr>
            <tr>
                <td><Cell><No n="4" />AMENDED RETURN?<Opts group={[`${X}optAmend:Y`, `${X}optAmend:N`]} labels={YN} /></Cell></td>
                {short
                    ? <td colSpan={2}><Cell><No n="5" />SHORT PERIOD RETURN?<Opts group={[`${X}optShort:Y`, `${X}optShort:N`]} labels={YN} /></Cell></td>
                    : <td colSpan={2}><Cell><No n="5" />NO. OF SHEETS ATTACHED<Txt k={`${X}txtSheets`} c /></Cell></td>}
                <td><Cell><No n="6" />ATC<Txt k={`${X}txtATC`} c /></Cell></td>
            </tr>
        </T>
    );
}
function CorpRate({ X, n }) {
    return (
        <T>
            <tr>
                <td className="bf-w25"><No n={String(n)} />INCOME TAX RATE</td>
                <td>
                    <Opts stack group={[`${X}optRate:R`, `${X}optRate:S`, `${X}optRate:P`]}
                        labels={["REGULAR RATE (25%)", "20% – NET TAXABLE INCOME NOT OVER ₱5,000,000 AND TOTAL ASSETS NOT OVER ₱100,000,000 (EXCLUDING LAND)", "SPECIAL/PREFERENTIAL RATE (SPECIFY %)"]} />
                    <div className="bf-gap" style={{ maxWidth: 160 }}><Txt k={`${X}txtSpecialRate`} r /></div>
                </td>
            </tr>
            <tr>
                <td className="bf-wrap-text"><No n={`${n}A`} />METHOD OF DEDUCTION</td>
                <td><Opts group={[`${X}optDeduct:I`, `${X}optDeduct:O`]} labels={["ITEMIZED DEDUCTIONS", "OPTIONAL STANDARD DEDUCTION (OSD) – 40% OF GROSS INCOME"]} /></td>
            </tr>
            <tr>
                <td className="bf-wrap-text"><No n={`${n}B`} />MINIMUM CORPORATE INCOME TAX (MCIT)</td>
                <td>
                    <Cell>
                        <Chk k={`${X}chkMcit`} label="SUBJECT TO MCIT (BEGINNING THE 4TH TAXABLE YEAR OF OPERATIONS)" />
                        <span className="bf-lbl">RATE (%)</span>
                        <span style={{ maxWidth: 90 }}><Txt k={`${X}txtMcitRate`} r /></span>
                    </Cell>
                </td>
            </tr>
        </T>
    );
}

const CQ = "frm1702q:";
function L1702Q_1() {
    return (
        <>
            <FormHead no="1702Q" month="JANUARY 2018 (ENCS)" title="QUARTERLY INCOME TAX RETURN"
                sub="FOR CORPORATIONS, PARTNERSHIPS AND OTHER NON-INDIVIDUAL TAXPAYERS" />
            <CorpTop X={CQ} quarter />
            <Bg X={CQ} n={7} />
            <CorpRate X={CQ} n={14} />
            <PartII X={CQ} n={15} dueLabel="INCOME TAX DUE (FROM SCHEDULE ITEM 17)" creditsLabel="LESS: TOTAL TAX CREDITS/PAYMENTS (FROM SCHEDULE ITEM 27)" />
            <PayPart X={CQ} n={20} />
        </>
    );
}
function L1702Q_2() {
    const l = lineOf(CQ);
    return (
        <>
            <T>
                <tr><td className="bf-w35">TIN</td><td>REGISTERED NAME</td></tr>
                <tr><td><Tin keys={[`${CQ}txtTIN1`, `${CQ}txtTIN2`, `${CQ}txtTIN3`, `${CQ}txtBranchCode`]} /></td><td><Txt k={`${CQ}txtTaxpayerName`} ro /></td></tr>
            </T>
            <T>
                <H span={3}>SCHEDULE - COMPUTATION OF INCOME TAX</H>
                {l("1", "SALES/RECEIPTS/REVENUES/FEES (NET OF SALES RETURNS, ALLOWANCES AND DISCOUNTS)", "sSales")}
                {l("2", "LESS: COST OF SALES/SERVICES", "sCost")}
                {l("3", "GROSS INCOME FROM OPERATION (ITEM 1 LESS ITEM 2)", "sGrossOp", true)}
                {l("4", "ADD: OTHER TAXABLE INCOME NOT SUBJECTED TO FINAL TAX", "sOther")}
                {l("5", "TOTAL GROSS INCOME (SUM OF ITEMS 3 AND 4)", "sTotalGross", true)}
                {l("6", "LESS: DEDUCTIONS (ITEMIZED)", "sItemized")}
                {l("7", "OPTIONAL STANDARD DEDUCTION (40% OF ITEM 5)", "sOsd", true)}
                {l("8", "TAXABLE INCOME THIS QUARTER", "sTaxableQ", true)}
                {l("9", "ADD: TAXABLE INCOME PREVIOUS QUARTER/S", "sPrev")}
                {l("10", "TOTAL TAXABLE INCOME TO DATE (SUM OF ITEMS 8 AND 9)", "sTaxableTD", true)}
                {l("11", "APPLICABLE INCOME TAX RATE", "sRatePct", true)}
                {l("12", "INCOME TAX DUE OTHER THAN MCIT (ITEM 10 X ITEM 11)", "sRegular", true)}
                {l("13", "ADD: GROSS INCOME PREVIOUS QUARTER/S (FOR MCIT)", "sPrevGross")}
                {l("14", "TOTAL GROSS INCOME TO DATE (SUM OF ITEMS 5 AND 13)", "sMcitBase", true)}
                {l("15", "MINIMUM CORPORATE INCOME TAX (ITEM 14 X MCIT RATE)", "sMcit", true)}
                {l("17", "INCOME TAX DUE (HIGHER OF ITEM 12 OR ITEM 15)", "sDue", true)}
            </T>
            <T>
                <H span={3}>TAX CREDITS/PAYMENTS</H>
                {l("18", "PRIOR YEAR'S EXCESS CREDITS OTHER THAN MCIT", "cPrior")}
                {l("19", "TAX PAYMENT/S FOR THE PREVIOUS QUARTER/S OF THE SAME TAXABLE YEAR OTHER THAN MCIT", "cPrevPay")}
                {l("20", "MCIT PAYMENT/S FOR THE PREVIOUS QUARTER/S OF THE SAME TAXABLE YEAR", "cPrevMcit")}
                {l("21", "CREDITABLE TAX WITHHELD FROM THE PREVIOUS QUARTER/S", "cPrevCwt")}
                {l("22", "CREDITABLE TAX WITHHELD PER BIR FORM NO. 2307 FOR THIS QUARTER", "cCwt")}
                {l("23", "TAX PAID IN RETURN PREVIOUSLY FILED, IF THIS IS AN AMENDED RETURN", "cFiled")}
                {l("24", "FOREIGN TAX CREDITS, IF APPLICABLE", "cForeign")}
                {l("25", "OTHER TAX CREDITS/PAYMENTS (SPECIFY)", "cOther", false, "cOtherSpecify")}
                {l("27", "TOTAL TAX CREDITS/PAYMENTS (SUM OF ITEMS 18 TO 25)", "cTotal", true)}
            </T>
        </>
    );
}

const CR = "frm1702rt:";
function L1702RT_1() {
    return (
        <>
            <FormHead no="1702-RT" month="JANUARY 2018 (ENCS)" title="ANNUAL INCOME TAX RETURN"
                sub="CORPORATION, PARTNERSHIP AND OTHER NON-INDIVIDUAL TAXPAYER SUBJECT ONLY TO REGULAR INCOME TAX RATE" />
            <CorpTop X={CR} short />
            <Bg X={CR} n={7} />
            <CorpRate X={CR} n={14} />
            <PartII X={CR} n={15} dueLabel="TOTAL INCOME TAX DUE (FROM PART IV ITEM 14)" creditsLabel="LESS: TOTAL TAX CREDITS/PAYMENTS (FROM PART IV ITEM 25)" />
            <OverPay X={CR} />
            <PayPart X={CR} n={20} />
        </>
    );
}
function L1702RT_2() {
    const l = lineOf(CR);
    return (
        <>
            <T>
                <tr><td className="bf-w35">TIN</td><td>REGISTERED NAME</td></tr>
                <tr><td><Tin keys={[`${CR}txtTIN1`, `${CR}txtTIN2`, `${CR}txtTIN3`, `${CR}txtBranchCode`]} /></td><td><Txt k={`${CR}txtTaxpayerName`} ro /></td></tr>
            </T>
            <T>
                <H span={3}>PART IV - COMPUTATION OF TAX</H>
                {l("1", "SALES/RECEIPTS/REVENUES/FEES", "sSales")}
                {l("2", "LESS: SALES RETURNS, ALLOWANCES AND DISCOUNTS", "sReturns")}
                {l("3", "NET SALES/RECEIPTS/REVENUES/FEES (ITEM 1 LESS ITEM 2)", "sNetSales", true)}
                {l("4", "LESS: COST OF SALES/SERVICES", "sCost")}
                {l("5", "GROSS INCOME FROM OPERATION (ITEM 3 LESS ITEM 4)", "sGrossOp", true)}
                {l("6", "ADD: OTHER TAXABLE INCOME NOT SUBJECTED TO FINAL TAX", "sOther")}
                {l("7", "TOTAL TAXABLE INCOME (SUM OF ITEMS 5 AND 6)", "sTotalGross", true)}
                {l("8", "LESS: ALLOWABLE DEDUCTIONS (ITEMIZED)", "sItemized")}
                {l("9", "OPTIONAL STANDARD DEDUCTION (40% OF ITEM 7)", "sOsd", true)}
                {l("10", "NET TAXABLE INCOME/(LOSS) (ITEM 7 LESS ITEM 8 OR ITEM 9)", "sTaxable", true)}
                {l("11", "APPLICABLE INCOME TAX RATE", "sRatePct", true)}
                {l("12", "INCOME TAX DUE OTHER THAN MCIT (ITEM 10 X ITEM 11)", "sRegular", true)}
                {l("13", "MINIMUM CORPORATE INCOME TAX (MCIT) (ITEM 7 X MCIT RATE)", "sMcit", true)}
                {l("14", "TOTAL INCOME TAX DUE (HIGHER OF ITEM 12 OR ITEM 13)", "sDue", true)}
            </T>
            <T>
                <H span={3}>TAX CREDITS/PAYMENTS</H>
                {l("15", "PRIOR YEAR'S EXCESS CREDITS OTHER THAN MCIT", "cPrior")}
                {l("16", "INCOME TAX PAYMENT UNDER MCIT FROM PREVIOUS QUARTER/S", "cMcitPrev")}
                {l("17", "INCOME TAX PAYMENT UNDER REGULAR RATE FROM PREVIOUS QUARTER/S (BIR FORM NO. 1702Q)", "cQuarterly")}
                {l("18", "CREDITABLE TAX WITHHELD FROM PREVIOUS QUARTER/S PER BIR FORM NO. 2307", "cCwtQ13")}
                {l("19", "CREDITABLE TAX WITHHELD PER BIR FORM NO. 2307 FOR THE 4TH QUARTER", "cCwtQ4")}
                {l("20", "TAX PAID IN RETURN PREVIOUSLY FILED, IF THIS IS AN AMENDED RETURN", "cFiled")}
                {l("21", "FOREIGN TAX CREDITS, IF APPLICABLE", "cForeign")}
                {l("22", "SPECIAL TAX CREDITS", "cSpecial")}
                {l("23", "OTHER TAX CREDITS/PAYMENTS (SPECIFY)", "cOther", false, "cOtherSpecify")}
                {l("25", "TOTAL TAX CREDITS/PAYMENTS (SUM OF ITEMS 15 TO 23)", "cTotal", true)}
            </T>
        </>
    );
}

const CX = "frm1702ex:";
function L1702EX_1() {
    const l = lineOf(CX);
    return (
        <>
            <FormHead no="1702-EX" month="JANUARY 2018 (ENCS)" title="ANNUAL INCOME TAX RETURN"
                sub="FOR USE ONLY BY CORPORATION, PARTNERSHIP AND OTHER NON-INDIVIDUAL TAXPAYER EXEMPT UNDER THE TAX CODE, AS AMENDED, AND OTHER SPECIAL LAWS, WITH NO OTHER TAXABLE INCOME" />
            <CorpTop X={CX} short />
            <Bg X={CX} n={7} />
            <T>
                <tr><td colSpan={2}><No n="14" />LEGAL BASIS OF TAX EXEMPTION (SPECIFY THE LAW / R.A. NO.)</td></tr>
                <tr><td colSpan={2}><Txt k={`${CX}txtLegalBasis`} /></td></tr>
                <tr>
                    <td className="bf-w50"><No n="15" />INVESTMENT PROMOTION AGENCY (IPA) / GOVERNMENT AGENCY</td>
                    <td><No n="16" />REGISTRATION / ACCREDITATION NO.</td>
                </tr>
                <tr><td><Txt k={`${CX}txtAgency`} /></td><td><Txt k={`${CX}txtRegNo`} /></td></tr>
                <tr><td><No n="17" />EFFECTIVITY DATE OF TAX EXEMPTION – FROM (MM/DD/YYYY)</td><td>TO (MM/DD/YYYY)</td></tr>
                <tr><td><Txt k={`${CX}txtEffFrom`} c /></td><td><Txt k={`${CX}txtEffTo`} c /></td></tr>
            </T>
            <T>
                <H span={3}>PART IV - SCHEDULE OF EXEMPT INCOME</H>
                {l("1", "SALES/RECEIPTS/REVENUES/FEES (NET OF SALES RETURNS, ALLOWANCES AND DISCOUNTS)", "sSales")}
                {l("2", "LESS: COST OF SALES/SERVICES", "sCost")}
                {l("3", "GROSS INCOME FROM OPERATION (ITEM 1 LESS ITEM 2)", "sGross", true)}
                {l("4", "ADD: OTHER INCOME", "sOther")}
                {l("5", "TOTAL GROSS INCOME (SUM OF ITEMS 3 AND 4)", "sTotalGross", true)}
                {l("6", "LESS: DEDUCTIONS", "sDeductions")}
                {l("7", "NET INCOME (ITEM 5 LESS ITEM 6) – EXEMPT FROM INCOME TAX", "sNet", true)}
            </T>
            <PartII X={CX} n={18} title="PART II - TOTAL AMOUNT PAYABLE (PENALTIES ONLY, IF FILED LATE)" dueLabel="INCOME TAX DUE (EXEMPT)" />
            <PayPart X={CX} n={23} />
        </>
    );
}

/* ---------- 1604C / 1604E ---------- */
function InfoTop({ X }) {
    return (
        <T>
            <tr><td><No n="1" />FOR THE YEAR (YYYY)</td><td><No n="2" />AMENDED RETURN?</td><td><No n="3" />NO. OF SHEETS ATTACHED</td></tr>
            <tr>
                <td><Txt k={`${X}txtYear`} c /></td>
                <td><Opts group={[`${X}optAmend:Y`, `${X}optAmend:N`]} labels={YN} /></td>
                <td><Txt k={`${X}txtSheets`} c /></td>
            </tr>
        </T>
    );
}
function InfoAgent({ X, n }) {
    return (
        <T>
            <tr>
                <td><No n={String(n)} />CATEGORY OF WITHHOLDING AGENT</td>
                <td><Opts group={[`${X}optCategory:P`, `${X}optCategory:G`]} labels={["PRIVATE", "GOVERNMENT"]} /></td>
                <td><No n={String(n + 1)} />TOP WITHHOLDING AGENT?</td>
                <td><Opts group={[`${X}optTop:Y`, `${X}optTop:N`]} labels={YN} /></td>
            </tr>
        </T>
    );
}
// 12 months: date · bank · TRA/eROR · amounts …
function Remits({ X, cols }) {
    return (
        <T>
            <H span={4 + cols.length}>PART II - SUMMARY OF REMITTANCES PER BIR FORM NO. {X === "frm1604c:" ? "1601-C" : "0619-E / 1601-EQ"}</H>
            <tr className="bf-c bf-sm">
                <td className="bf-w10">MONTH</td><td>DATE OF REMITTANCE (MM/DD/YYYY)</td><td>DRAWEE BANK / BANK CODE / AGENCY</td><td>TRA / eROR / eAR NUMBER</td>
                {cols.map(([, label]) => <td key={label}>{label}</td>)}
            </tr>
            {MONTHS_UP.map((mn, i) => (
                <tr key={mn}>
                    <td className="bf-sm">{mn}</td>
                    <td><Txt k={`${X}r${i + 1}Date`} c /></td>
                    <td><Txt k={`${X}r${i + 1}Bank`} /></td>
                    <td><Txt k={`${X}r${i + 1}Ror`} /></td>
                    {cols.map(([c]) => <td key={c}><Num k={`${X}r${i + 1}${c}`} ro={c === "Total"} /></td>)}
                </tr>
            ))}
            <tr className="bf-bold">
                <td colSpan={4} className="bf-c"><b>TOTAL</b></td>
                {cols.map(([c]) => <td key={c}><Num k={`${X}tot${c}`} ro /></td>)}
            </tr>
        </T>
    );
}

const PC = "frm1604c:";
function L1604C() {
    return (
        <>
            <FormHead no="1604-C" month="JANUARY 2018 (ENCS)" title="ANNUAL INFORMATION RETURN OF INCOME TAXES WITHHELD ON COMPENSATION" />
            <InfoTop X={PC} />
            <Bg X={PC} n={4} agent lob={false} />
            <InfoAgent X={PC} n={10} />
            <T>
                <tr>
                    <td className="bf-wrap-text" colSpan={3}><No n="12" />IN CASE OF OVERWITHHOLDING/OVERREMITTANCE AFTER THE YEAR-END ADJUSTMENTS ON COMPENSATION, HAVE YOU RELEASED THE REFUND/S TO YOUR EMPLOYEE/S?</td>
                    <td><Opts group={[`${PC}optRefund:Y`, `${PC}optRefund:N`]} labels={YN} /></td>
                </tr>
                <tr>
                    <td><No n="12A" />IF YES, DATE OF REFUND (MM/DD/YYYY)</td><td><Txt k={`${PC}txtRefundDate`} c /></td>
                    <td><No n="13" />TOTAL AMOUNT OF OVERREMITTANCE ON TAX WITHHELD UNDER COMPENSATION</td><td><Num k={`${PC}txtOverRemit`} /></td>
                </tr>
                <tr><td colSpan={3}><No n="14" />MONTH OF FIRST CREDITING OF OVERREMITTANCE (MM)</td><td><Txt k={`${PC}txtFirstCredit`} c /></td></tr>
            </T>
            <Remits X={PC} cols={[["Tax", "TAXES WITHHELD"], ["Adj", "ADJUSTMENT"], ["Pen", "PENALTIES"], ["Total", "TOTAL AMOUNT REMITTED"]]} />
            <Declaration text={DECL_INFO} agent="txtTaxAgentNo" issue="txtDateIssue" expiry="txtDateExpiry" />
            <Note />
        </>
    );
}

const PE = "frm1604e:";
function L1604E() {
    return (
        <>
            <FormHead no="1604-E" month="JANUARY 2018 (ENCS)" title="ANNUAL INFORMATION RETURN OF CREDITABLE INCOME TAXES WITHHELD (EXPANDED) / INCOME PAYMENTS EXEMPT FROM WITHHOLDING TAX" />
            <InfoTop X={PE} />
            <Bg X={PE} n={4} agent lob={false} />
            <InfoAgent X={PE} n={10} />
            <Remits X={PE} cols={[["Tax", "TAXES WITHHELD"], ["Pen", "PENALTIES"], ["Total", "TOTAL AMOUNT REMITTED"]]} />
            <Declaration text={DECL_INFO} agent="txtTaxAgentNo" issue="txtDateIssue" expiry="txtDateExpiry" />
            <Note />
        </>
    );
}

/* ---------- 2200M ---------- */
const XM = "frm2200m:";
function L2200M() {
    const l = lineOf(XM);
    return (
        <>
            <FormHead no="2200-M" month="DECEMBER 2003 (ENCS)" title="EXCISE TAX RETURN FOR MINERAL PRODUCTS" />
            <T>
                <tr><td><No n="1" />FOR THE MONTH (MM/YYYY)</td><td><No n="2" />AMENDED RETURN?</td><td><No n="3" />NO. OF SHEETS ATTACHED</td><td><No n="4" />ATC</td></tr>
                <tr>
                    <td><MonthF parts={[[`${XM}txtMonth`, "m"], [`${XM}txtYear`, "y"]]} /></td>
                    <td><Opts group={[`${XM}optAmend:Y`, `${XM}optAmend:N`]} labels={YN} /></td>
                    <td><Txt k={`${XM}txtSheets`} c /></td>
                    <td><Txt k={`${XM}txtATC`} c /></td>
                </tr>
            </T>
            <Bg X={XM} n={5} />
            <T>
                <tr>
                    <td className="bf-w25"><No n="12" />TAXPAYER IS</td>
                    <td><Opts group={[`${XM}optKind:P`, `${XM}optKind:I`, `${XM}optKind:O`]} labels={["PRODUCER / PROCESSOR", "IMPORTER", "OTHERS"]} /></td>
                </tr>
            </T>
            <T>
                <H span={6}>PART II - COMPUTATION OF TAX</H>
                <tr className="bf-c bf-sm">
                    <td>MINERAL PRODUCT (DESCRIPTION)</td><td className="bf-w10">UNIT</td><td className="bf-w15">QUANTITY / VOLUME</td>
                    <td className="bf-w15">ACTUAL MARKET VALUE / GROSS OUTPUT</td><td className="bf-w10">TAX RATE (%)</td><td className="bf-w15">EXCISE TAX DUE</td>
                </tr>
                {[1, 2, 3, 4, 5].map((i) => (
                    <tr key={i}>
                        <td><Cell><No n={`13${"ABCDE"[i - 1]}`} /><Txt k={`${XM}r${i}Desc`} /></Cell></td>
                        <td><Txt k={`${XM}r${i}Unit`} c /></td>
                        <td><Num k={`${XM}r${i}Qty`} blank="" /></td>
                        <td><Num k={`${XM}r${i}Value`} /></td>
                        <td><Txt k={`${XM}r${i}Rate`} r /></td>
                        <td><Num k={`${XM}r${i}Due`} ro /></td>
                    </tr>
                ))}
                <tr>
                    <td colSpan={3} className="bf-c"><No n="14" />TOTAL</td>
                    <td><Num k={`${XM}totValue`} ro /></td><td /><td><Num k={`${XM}totDue`} ro /></td>
                </tr>
            </T>
            <T>
                <H span={3}>LESS: TAX CREDITS/PAYMENTS</H>
                {l("15A", "TAX PAID IN RETURN PREVIOUSLY FILED, IF THIS IS AN AMENDED RETURN", "cFiled")}
                {l("15B", "OTHER TAX CREDITS/PAYMENTS (SPECIFY)", "cOther", false, "cOtherSpecify")}
                {l("15C", "TOTAL TAX CREDITS/PAYMENTS (SUM OF ITEMS 15A AND 15B)", "cTotal", true)}
            </T>
            <PartII X={XM} n={16} title="TOTAL TAX PAYABLE" dueLabel="TOTAL EXCISE TAX DUE (FROM ITEM 14)" creditsLabel="LESS: TOTAL TAX CREDITS/PAYMENTS (ITEM 15C)" />
            <PayPart X={XM} n={21} />
        </>
    );
}

export const LAYOUTS = {
    "0605": [L0605],
    "0619E": [L0619E],
    "1601C": [L1601C_1, L1601C_2],
    "1601EQ": [L1601EQ],
    "2550M": [L2550M],
    "2550Qv2024": [L2550Q_1, L2550Q_2],
    "2551Qv2018": [L2551Q_1, L2551Q_2],
    // new (FEMS design)
    "1604C": [L1604C],
    "1604E": [L1604E],
    "1701Q": [L1701Q_1, L1701Q_2],
    "1701": [L1701_1, L1701_2],
    "1702Q": [L1702Q_1, L1702Q_2],
    "1702RT": [L1702RT_1, L1702RT_2],
    "1702EX": [L1702EX_1],
    "2200M": [L2200M],
};