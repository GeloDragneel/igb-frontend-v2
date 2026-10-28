// FEMS → Admin → Employee: the same page as HR Management → Employees,
// but only the employees of the branch picked at the top (follows the branch switch) and no leave credits
import EmployeeHR from "./hr/EmployeeHR";

export default function BranchEmployees() {
    return <EmployeeHR branchMode />;
}