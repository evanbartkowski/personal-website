// Facts transcribed from the original documents supplied by Evan.
// Categories describe the document, rather than treating all awards as certifications.
const base = '/assets/credentials/';
export const credentialDocuments = [
  {
    id: 'security-plus', number: '01', category: 'certification', categoryLabel: 'PROFESSIONAL CERTIFICATION',
    title: 'CompTIA Security+', issuer: 'CompTIA',
    date: '2025-03-22', dateLabel: 'Issued March 22, 2025',
    detail: 'Security+ ce certification, exam SY0-701. The original certificate records an expiration date of March 22, 2028.',
    pdf: `${base}comptia-security-plus.pdf`, preview: `${base}comptia-security-plus.png`,
    downloadName: 'Evan-Bartkowski-CompTIA-Security-Plus.pdf',
  },
  {
    id: 'google-ai', number: '02', category: 'learning', categoryLabel: 'LEARNING CREDENTIAL',
    title: 'Google AI Essentials', issuer: 'Coursera',
    date: '2025-02-27', dateLabel: 'Issued February 27, 2025',
    detail: 'A Google AI Essentials learning credential issued by Coursera. The original badge document includes its public verification link.',
    pdf: `${base}google-ai-essentials.pdf`, preview: `${base}google-ai-essentials.png`,
    downloadName: 'Evan-Bartkowski-Google-AI-Essentials.pdf',
    verification: 'https://www.credly.com/go/6TNnbJAl',
  },
  {
    id: 'google-prompting', number: '03', category: 'learning', categoryLabel: 'LEARNING CREDENTIAL',
    title: 'Google Prompting Essentials', issuer: 'Coursera',
    date: '2025-02-27', dateLabel: 'Issued February 27, 2025',
    detail: 'A Google Prompting Essentials learning credential issued by Coursera. The original badge document includes its public verification link.',
    pdf: `${base}google-prompting-essentials.pdf`, preview: `${base}google-prompting-essentials.png`,
    downloadName: 'Evan-Bartkowski-Google-Prompting-Essentials.pdf',
    verification: 'https://www.credly.com/go/u9vJcnAg',
  },
  {
    id: 'ai4all', number: '04', category: 'learning', categoryLabel: 'PROGRAM COMPLETION',
    title: 'AI4ALL Ignite', issuer: 'AI4ALL',
    date: '2024-09-08', dateLabel: 'Completed September 8, 2024',
    detail: 'Certificate of successful completion of the AI4ALL Ignite program. The completion date printed on the document is September 8, 2024.',
    pdf: `${base}ai4all-ignite.pdf`, preview: `${base}ai4all-ignite.png`,
    downloadName: 'Evan-Bartkowski-AI4ALL-Ignite.pdf',
  },
  {
    id: 'deans-list', number: '05', category: 'honor', categoryLabel: 'ACADEMIC HONOR',
    title: 'UMBC Dean’s List', issuer: 'University of Maryland, Baltimore County',
    date: '2025-01-21', dateLabel: 'Fall 2024 · Awarded January 21, 2025',
    detail: 'Dean’s List recognition for the Fall 2024 semester. This is an academic honor, separate from the computer science degree.',
    pdf: `${base}umbc-certificate.pdf`, preview: `${base}umbc-certificate.png`,
    downloadName: 'Evan-Bartkowski-UMBC-Deans-List-Fall-2024.pdf',
  },
  {
    id: 'security-training', number: '06', category: 'learning', categoryLabel: '40-HOUR TRAINING',
    title: 'Security+ Training', issuer: 'UMBC Training Centers',
    date: '2025-01-24', dateLabel: 'Completed January 24, 2025',
    detail: 'Certificate of training for a 40-hour CompTIA Security+ course completed at UMBC Training Centers. This training preceded the CompTIA-issued certification.',
    pdf: `${base}security-training.pdf`, preview: `${base}security-training.png`,
    downloadName: 'Evan-Bartkowski-UMBC-Security-Plus-Training.pdf',
  },
  {
    id: 'nscs', number: '07', category: 'honor', categoryLabel: 'HONOR SOCIETY MEMBERSHIP',
    title: 'National Society of Collegiate Scholars', issuer: 'The National Society of Collegiate Scholars',
    date: '2022-02-09', dateLabel: 'Lifetime member · Joined February 9, 2022',
    detail: 'Lifetime membership in the National Society of Collegiate Scholars. The certificate records a join date of February 9, 2022. The supplied PDF and JPG show the same membership.',
    pdf: `${base}nscs-membership.pdf`, preview: `${base}nscs-membership.png`,
    originalImage: `${base}nscs-membership-original.jpg`,
    downloadName: 'Evan-Bartkowski-NSCS-Lifetime-Membership.pdf',
  },
];
