export const ROLE_OPTIONS: Array<{ value: string; label: string }> = [
  // PT - Part Time Coaches
  { value: "PT - Coach EGR", label: "PT - Coach EGR" },
  { value: "PT - Coach DA", label: "PT - Coach DA" },
  { value: "PT - Coach SA", label: "PT - Coach SA" },
  { value: "PT - Coach SHA", label: "PT - Coach SHA" },
  { value: "PT - Coach KLG", label: "PT - Coach KLG" },
  { value: "PT - Coach RBY", label: "PT - Coach RBY" },
  { value: "PT - Coach SB", label: "PT - Coach SB" },
  { value: "PT - Coach AC", label: "PT - Coach AC" },
  { value: "PT - Coach ST", label: "PT - Coach ST" },
  { value: "PT - Coach KD", label: "PT - Coach KD" },
  { value: "PT - Coach DSH", label: "PT - Coach DSH" },
  { value: "PT - Coach SLY", label: "PT - Coach SLY" },
  { value: "PT - Coach TSG", label: "PT - Coach TSG" },
  { value: "PT - Coach DK", label: "PT - Coach DK" },
  { value: "PT - Coach AMP", label: "PT - Coach AMP" },
  { value: "PT - Coach SP", label: "PT - Coach SP" },
  { value: "PT - Coach BTHO", label: "PT - Coach BTHO" },
  { value: "PT - Coach KTG", label: "PT - Coach KTG" },
  { value: "PT - Coach DPU", label: "PT - Coach DPU" },
  { value: "PT - Coach BBB", label: "PT - Coach BBB" },
  { value: "PT - Coach PJY", label: "PT - Coach PJY" },
  { value: "PT - Coach CJY", label: "PT - Coach CJY" },
  { value: "PT - Coach BSP", label: "PT - Coach BSP" },
  { value: "PT - Coach KW", label: "PT - Coach KW" },
  { value: "PT - Coach SNT", label: "PT - Coach SNT" },
  { value: "PT - Coach SBM", label: "PT - Coach SBM" },
  // FT - Full Time Coaches
  { value: "FT - Coach EGR", label: "FT - Coach EGR" },
  { value: "FT - Coach DA", label: "FT - Coach DA" },
  { value: "FT - Coach SA", label: "FT - Coach SA" },
  { value: "FT - Coach SHA", label: "FT - Coach SHA" },
  { value: "FT - Coach KLG", label: "FT - Coach KLG" },
  { value: "FT - Coach RBY", label: "FT - Coach RBY" },
  { value: "FT - Coach SB", label: "FT - Coach SB" },
  { value: "FT - Coach AC", label: "FT - Coach AC" },
  { value: "FT - Coach ST", label: "FT - Coach ST" },
  { value: "FT - Coach KD", label: "FT - Coach KD" },
  { value: "FT - Coach DSH", label: "FT - Coach DSH" },
  { value: "FT - Coach SLY", label: "FT - Coach SLY" },
  { value: "FT - Coach TSG", label: "FT - Coach TSG" },
  { value: "FT - Coach DK", label: "FT - Coach DK" },
  { value: "FT - Coach AMP", label: "FT - Coach AMP" },
  { value: "FT - Coach SP", label: "FT - Coach SP" },
  { value: "FT - Coach BTHO", label: "FT - Coach BTHO" },
  { value: "FT - Coach KTG", label: "FT - Coach KTG" },
  { value: "FT - Coach DPU", label: "FT - Coach DPU" },
  { value: "FT - Coach BBB", label: "FT - Coach BBB" },
  { value: "FT - Coach PJY", label: "FT - Coach PJY" },
  { value: "FT - Coach CJY", label: "FT - Coach CJY" },
  { value: "FT - Coach BSP", label: "FT - Coach BSP" },
  { value: "FT - Coach KW", label: "FT - Coach KW" },
  { value: "FT - Coach SNT", label: "FT - Coach SNT" },
  { value: "FT - Coach SBM", label: "FT - Coach SBM" },
  // FT HOD - Full Time Head of Department
  { value: "FT HOD - HQ", label: "FT HOD - HQ" },
  { value: "FT HOD - OD", label: "FT HOD - OD" },
  { value: "FT HOD - MKT", label: "FT HOD - MKT" },
  { value: "FT HOD - FIN", label: "FT HOD - FIN" },
  { value: "FT HOD - HR", label: "FT HOD - HR" },
  { value: "FT HOD - IOP", label: "FT HOD - IOP" },
  { value: "FT HOD - ACD", label: "FT HOD - ACD" },
  { value: "FT HOD - RM (A)", label: "FT HOD - RM (A)" },
  { value: "FT HOD - RM (B)", label: "FT HOD - RM (B)" },
  { value: "FT HOD - RM (C)", label: "FT HOD - RM (C)" },
  // FT EXEC - Full Time Executive
  { value: "FT EXEC - HQ", label: "FT EXEC - HQ" },
  { value: "FT EXEC - OD", label: "FT EXEC - OD" },
  { value: "FT EXEC - MKT", label: "FT EXEC - MKT" },
  { value: "FT EXEC - FIN", label: "FT EXEC - FIN" },
  { value: "FT EXEC - HR", label: "FT EXEC - HR" },
  { value: "FT EXEC - IOP", label: "FT EXEC - IOP" },
  { value: "FT EXEC - ACD", label: "FT EXEC - ACD" },
  // BM - Branch Manager
  { value: "BM - EGR", label: "BM - EGR" },
  { value: "BM - DA", label: "BM - DA" },
  { value: "BM - SA", label: "BM - SA" },
  { value: "BM - SHA", label: "BM - SHA" },
  { value: "BM - KLG", label: "BM - KLG" },
  { value: "BM - RBY", label: "BM - RBY" },
  { value: "BM - SB", label: "BM - SB" },
  { value: "BM - AC", label: "BM - AC" },
  { value: "BM - ST", label: "BM - ST" },
  { value: "BM - KD", label: "BM - KD" },
  { value: "BM - DSH", label: "BM - DSH" },
  { value: "BM - SLY", label: "BM - SLY" },
  { value: "BM - TSG", label: "BM - TSG" },
  { value: "BM - DK", label: "BM - DK" },
  { value: "BM - AMP", label: "BM - AMP" },
  { value: "BM - SP", label: "BM - SP" },
  { value: "BM - BTHO", label: "BM - BTHO" },
  { value: "BM - KTG", label: "BM - KTG" },
  { value: "BM - DPU", label: "BM - DPU" },
  { value: "BM - BBB", label: "BM - BBB" },
  { value: "BM - PJY", label: "BM - PJY" },
  { value: "BM - CJY", label: "BM - CJY" },
  { value: "BM - BSP", label: "BM - BSP" },
  { value: "BM - KW", label: "BM - KW" },
  { value: "BM - SNT", label: "BM - SNT" },
  { value: "BM - SBM", label: "BM - SBM" },
  { value: "BM - HQ", label: "BM - HQ" },
  { value: "BM - OD", label: "BM - OD" },
  { value: "BM - MKT", label: "BM - MKT" },
  { value: "BM - FIN", label: "BM - FIN" },
  { value: "BM - HR", label: "BM - HR" },
  { value: "BM - IOP", label: "BM - IOP" },
  { value: "BM - ACD", label: "BM - ACD" },
  // INT - Interns
  { value: "INT - EGR", label: "INT - EGR" },
  { value: "INT - DA", label: "INT - DA" },
  { value: "INT - SA", label: "INT - SA" },
  { value: "INT - SHA", label: "INT - SHA" },
  { value: "INT - KLG", label: "INT - KLG" },
  { value: "INT - RBY", label: "INT - RBY" },
  { value: "INT - SB", label: "INT - SB" },
  { value: "INT - AC", label: "INT - AC" },
  { value: "INT - ST", label: "INT - ST" },
  { value: "INT - KD", label: "INT - KD" },
  { value: "INT - DSH", label: "INT - DSH" },
  { value: "INT - SLY", label: "INT - SLY" },
  { value: "INT - TSG", label: "INT - TSG" },
  { value: "INT - DK", label: "INT - DK" },
  { value: "INT - AMP", label: "INT - AMP" },
  { value: "INT - SP", label: "INT - SP" },
  { value: "INT - BTHO", label: "INT - BTHO" },
  { value: "INT - KTG", label: "INT - KTG" },
  { value: "INT - DPU", label: "INT - DPU" },
  { value: "INT - BBB", label: "INT - BBB" },
  { value: "INT - PJY", label: "INT - PJY" },
  { value: "INT - CJY", label: "INT - CJY" },
  { value: "INT - BSP", label: "INT - BSP" },
  { value: "INT - KW", label: "INT - KW" },
  { value: "INT - SNT", label: "INT - SNT" },
  { value: "INT - SBM", label: "INT - SBM" },
  { value: "INT - HQ", label: "INT - HQ" },
  { value: "INT - OD", label: "INT - OD" },
  { value: "INT - MKT", label: "INT - MKT" },
  { value: "INT - FIN", label: "INT - FIN" },
  { value: "INT - HR", label: "INT - HR" },
  { value: "INT - IOP", label: "INT - IOP" },
  { value: "INT - ACD", label: "INT - ACD" },
];

export const CONTRACT_OPTIONS = [
  { value: "", label: "None" },
  { value: "12 MONTH", label: "12 Month" },
  { value: "15 MONTH", label: "15 Month" },
  { value: "18 MONTH", label: "18 Month" },
];

export const BRANCH_OPTIONS = [
  { value: "HQ", label: "Headquarters" },
  { value: "BR", label: "Branch 1" },
  { value: "BR2", label: "Branch 2" },
  { value: "BR3", label: "Branch 3" },
];

export const GENDER_OPTIONS = [
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
];

export function getRoleLabel(role: string): string {
  const option = ROLE_OPTIONS.find((opt) => opt.value === role);
  return option?.label || role;
}

export function getBranchLabel(branch: string): string {
  const option = BRANCH_OPTIONS.find((opt) => opt.value === branch);
  return option?.label || branch;
}

export function getContractLabel(contract: string): string {
  const option = CONTRACT_OPTIONS.find((opt) => opt.value === contract);
  return option?.label || contract;
}

export function getGenderLabel(gender: string): string {
  const option = GENDER_OPTIONS.find((opt) => opt.value === gender);
  return option?.label || gender;
}
