/**
 * excel-service.ts
 * ---------------------------------------------------------------------------
 * High-performance Excel (.xlsx / .csv) Export & Import Engine
 * for Student Examination Marks, Question Answers, and Integrity Audits.
 *
 * Provides Faculty and Administrators with:
 *  1. One-click Export of all Students' Exam Marks & Scores to .xlsx
 *  2. Detailed Question-Level Answer Breakdown Sheet
 *  3. Excel Template Generation for Offline Grading & Imports
 *  4. Intelligent Header-Matching Excel / CSV Importer with Live Validation Preview
 *  5. Direct Persistence into the Proctor Store Database
 */

import * as XLSX from "xlsx";
import {
  computeRisk,
  loadDB,
  uid,
  updateDB,
  type Exam,
  type ExamScoreSummary,
  type ExamSession,
} from "./proctor-store";

export interface ParsedMarksRow {
  studentId: string;
  studentName: string;
  examId?: string;
  examTitle?: string;
  mcqScore: number;
  mcqTotal: number;
  codingScore: number;
  codingTotal: number;
  totalScore: number;
  maxScore: number;
  percentage: number;
  status: "PASSED" | "FAILED";
  answers?: Record<string, number>;
  tabSwitches?: number;
  fullscreenExits?: number;
  remarks?: string;
  matchedExisting?: boolean;
}

export interface ImportValidationSummary {
  rows: ParsedMarksRow[];
  totalParsed: number;
  matchedCount: number;
  newCount: number;
  errors: string[];
}

/**
 * Exports complete students' exam marks, question answers, and integrity metrics
 * to a multi-sheet Microsoft Excel (.xlsx) workbook.
 */
export function exportStudentMarksExcel(
  sessions: ExamSession[],
  filterExamId?: string,
  filenamePrefix = "Student_Exam_Marks_Report"
) {
  const targetSessions = filterExamId
    ? sessions.filter((s) => s.examId === filterExamId)
    : sessions;

  if (targetSessions.length === 0) {
    throw new Error("No exam sessions found to export.");
  }

  const wb = XLSX.utils.book_new();
  const db = loadDB();

  // -------------------------------------------------------------------------
  // Sheet 1: Student Marks & Results Summary
  // -------------------------------------------------------------------------
  const summaryRows = targetSessions.map((s, index) => {
    const risk = computeRisk(s.metrics);
    const score = s.scoreSummary || {
      mcqScore: 0,
      mcqTotal: 0,
      codingScore: 0,
      codingTotal: 0,
      totalScore: 0,
      maxScore: 0,
      percentage: 0,
    };

    const isPassed = score.percentage >= 50;
    const tabSwitches = s.metrics?.tabSwitches ?? 0;
    const fullscreenExits =
      s.metrics?.fullscreenExits ??
      s.events?.filter(
        (e) =>
          (e.type as string) === "fullscreen_exit" ||
          e.label.toLowerCase().includes("fullscreen")
      ).length ??
      0;

    const headCounts = s.metrics?.headCounts || { up: 0, down: 0, left: 0, right: 0 };
    const totalHeadTurns = s.metrics?.totalHeadTurns ?? s.metrics?.headMovementCount ?? (headCounts.up + headCounts.down + headCounts.left + headCounts.right);
    const handCounts = s.metrics?.handCounts || { raised: 0, near_face: 0, near_ear: 0, below_desk: 0, repeated_movements: 0 };
    const totalHandEvents = s.metrics?.totalHandEvents ?? s.metrics?.handEvents ?? (handCounts.raised + handCounts.near_face + handCounts.near_ear + handCounts.below_desk);
    const gazeCounts = s.metrics?.gazeCounts || { up: 0, down: 0, left: 0, right: 0, off_screen: 0 };
    const lookAwayCount = gazeCounts.off_screen ?? s.metrics?.lookAwayCount ?? 0;
    const totalGazeLooks = s.metrics?.totalGazeLooks ?? (gazeCounts.up + gazeCounts.down + gazeCounts.left + gazeCounts.right + (gazeCounts.off_screen ?? 0) || lookAwayCount);
    const phoneCount = s.events?.filter((e) => e.type === "phone" || e.label.toLowerCase().includes("phone")).length ?? 0;
    const watchCount = s.events?.filter((e) => e.type === "second_device" || e.label.toLowerCase().includes("smartwatch") || e.label.toLowerCase().includes("watch")).length ?? 0;

    return {
      "S.No": index + 1,
      "Student ID / Roll No": s.studentId,
      "Candidate Name": s.studentName,
      "Exam ID": s.examId,
      "Exam Title": s.examTitle,
      "MCQ Marks": score.mcqScore,
      "MCQ Total": score.mcqTotal,
      "Coding Marks": score.codingScore,
      "Coding Total": score.codingTotal,
      "Total Marks Obtained": score.totalScore,
      "Maximum Marks": score.maxScore,
      "Percentage (%)": `${score.percentage}%`,
      "Result Grade": isPassed ? "PASSED" : "FAILED",
      "Academic Status": score.percentage >= 75 ? "Distinction" : score.percentage >= 50 ? "Pass" : "Fail / Reappear",
      "Integrity Category": risk.category,
      "Suspicion Score (%)": `${risk.score}%`,
      "Tab Switch Count": tabSwitches,
      "Fullscreen Exit Count": fullscreenExits,
      "Total Head Turns": totalHeadTurns,
      "Head Left Turns": headCounts.left,
      "Head Right Turns": headCounts.right,
      "Head Up Pitch": headCounts.up,
      "Head Down Pitch": headCounts.down,
      "Total Hand Events": totalHandEvents,
      "Hand Raised Count": handCounts.raised,
      "Hand Near Face": handCounts.near_face,
      "Hand Near Ear (Phone)": handCounts.near_ear,
      "Hand Below Desk": handCounts.below_desk,
      "Total Gaze Looks": totalGazeLooks,
      "Off-Screen Gaze Looks": lookAwayCount,
      "Voice & Conversation (s)": s.metrics?.voiceSeconds ?? 0,
      "Phone Detections": phoneCount,
      "Smartwatch Detections": watchCount,
      "Exam Session Status": s.status.toUpperCase(),
      "Started At": new Date(s.startedAt).toLocaleString(),
      "Submitted At": s.endedAt ? new Date(s.endedAt).toLocaleString() : "In Progress",
      "Faculty Review Status": (s as any).review?.status ?? "Pending Review",
    };
  });

  const wsSummary = XLSX.utils.json_to_sheet(summaryRows);

  // Auto-fit column widths
  const colWidths = [
    { wch: 6 },  // S.No
    { wch: 18 }, // Student ID
    { wch: 22 }, // Candidate Name
    { wch: 12 }, // Exam ID
    { wch: 28 }, // Exam Title
    { wch: 12 }, // MCQ Marks
    { wch: 12 }, // MCQ Total
    { wch: 14 }, // Coding Marks
    { wch: 14 }, // Coding Total
    { wch: 18 }, // Total Marks Obtained
    { wch: 14 }, // Maximum Marks
    { wch: 14 }, // Percentage
    { wch: 14 }, // Result Grade
    { wch: 16 }, // Academic Status
    { wch: 16 }, // Integrity Category
    { wch: 18 }, // Suspicion Score
    { wch: 16 }, // Tab Switch Count
    { wch: 18 }, // Fullscreen Exit Count
    { wch: 16 }, // Total Head Turns
    { wch: 14 }, // Head Left Turns
    { wch: 14 }, // Head Right Turns
    { wch: 14 }, // Head Up Pitch
    { wch: 14 }, // Head Down Pitch
    { wch: 16 }, // Total Hand Events
    { wch: 16 }, // Hand Raised Count
    { wch: 16 }, // Hand Near Face
    { wch: 20 }, // Hand Near Ear (Phone)
    { wch: 16 }, // Hand Below Desk
    { wch: 16 }, // Total Gaze Looks
    { wch: 18 }, // Off-Screen Gaze Looks
    { wch: 22 }, // Voice & Conversation (s)
    { wch: 16 }, // Phone Detections
    { wch: 20 }, // Smartwatch Detections
    { wch: 18 }, // Session Status
    { wch: 22 }, // Started At
    { wch: 22 }, // Submitted At
    { wch: 20 }, // Faculty Review Status
  ];
  wsSummary["!cols"] = colWidths;
  XLSX.utils.book_append_sheet(wb, wsSummary, "Student Marks Summary");

  // -------------------------------------------------------------------------
  // Sheet 2: Question-by-Question Answers Breakdown
  // -------------------------------------------------------------------------
  const answerRows: any[] = [];
  targetSessions.forEach((s) => {
    const exam = db.exams.find((e) => e.id === s.examId);
    if (!exam || !exam.questions) return;

    exam.questions.forEach((q, qIdx) => {
      const studentSelectedIdx = s.answers ? s.answers[q.id] : undefined;
      const studentAnswerText =
        studentSelectedIdx !== undefined ? q.options[studentSelectedIdx] ?? `Option ${studentSelectedIdx + 1}` : "Not Answered";
      const correctAnswerText = q.options[q.answer] ?? `Option ${q.answer + 1}`;
      const isCorrect = studentSelectedIdx === q.answer;

      answerRows.push({
        "Student ID": s.studentId,
        "Candidate Name": s.studentName,
        "Exam Title": s.examTitle,
        "Question No": qIdx + 1,
        "Question ID": q.id,
        "Question Prompt": q.text,
        "Student Selected Option": studentSelectedIdx !== undefined ? studentSelectedIdx + 1 : "None",
        "Student Answer Text": studentAnswerText,
        "Correct Option": q.answer + 1,
        "Correct Answer Text": correctAnswerText,
        "Evaluation": isCorrect ? "CORRECT (+1)" : "INCORRECT (0)",
        "Points Awarded": isCorrect ? (q.points ?? 1) : 0,
      });
    });
  });

  if (answerRows.length > 0) {
    const wsAnswers = XLSX.utils.json_to_sheet(answerRows);
    wsAnswers["!cols"] = [
      { wch: 16 }, // Student ID
      { wch: 20 }, // Candidate Name
      { wch: 24 }, // Exam Title
      { wch: 12 }, // Question No
      { wch: 12 }, // Question ID
      { wch: 45 }, // Question Prompt
      { wch: 22 }, // Student Selected Option
      { wch: 30 }, // Student Answer Text
      { wch: 14 }, // Correct Option
      { wch: 30 }, // Correct Answer Text
      { wch: 18 }, // Evaluation
      { wch: 14 }, // Points Awarded
    ];
    XLSX.utils.book_append_sheet(wb, wsAnswers, "Answers Breakdown");
  }

  // Generate date stamp for filename
  const dateStr = new Date().toISOString().slice(0, 10);
  const cleanFilename = `${filenamePrefix}_${dateStr}.xlsx`;

  XLSX.writeFile(wb, cleanFilename);
}

/**
 * Downloads a standardized Excel template for Faculty and Admin to import student marks.
 */
export function downloadMarksImportTemplate(exam?: Exam) {
  const wb = XLSX.utils.book_new();

  const sampleExamId = exam?.id || "e1";
  const sampleExamTitle = exam?.title || "Data Structures & AI Algorithms Final Exam";
  const mcqCount = exam?.questions?.length || 10;
  const codingCount = exam?.codingQuestions?.length || 2;
  const totalCount = mcqCount + codingCount;

  const templateRows = [
    {
      "Student ID": "s1",
      "Candidate Name": "Alice Chen",
      "Exam ID": sampleExamId,
      "Exam Title": sampleExamTitle,
      "MCQ Score": mcqCount,
      "MCQ Total": mcqCount,
      "Coding Score": codingCount,
      "Coding Total": codingCount,
      "Total Marks": totalCount,
      "Max Marks": totalCount,
      "Percentage": 100,
      "Result Status": "PASSED",
      "Remarks": "Full marks scored",
    },
    {
      "Student ID": "s2",
      "Candidate Name": "Bob Martinez",
      "Exam ID": sampleExamId,
      "Exam Title": sampleExamTitle,
      "MCQ Score": Math.round(mcqCount * 0.8),
      "MCQ Total": mcqCount,
      "Coding Score": Math.round(codingCount * 0.75 * 10) / 10,
      "Coding Total": codingCount,
      "Total Marks": Math.round((mcqCount * 0.8 + codingCount * 0.75) * 10) / 10,
      "Max Marks": totalCount,
      "Percentage": 79,
      "Result Status": "PASSED",
      "Remarks": "Good performance",
    },
    {
      "Student ID": "s3",
      "Candidate Name": "Carol Davis",
      "Exam ID": sampleExamId,
      "Exam Title": sampleExamTitle,
      "MCQ Score": Math.round(mcqCount * 0.4),
      "MCQ Total": mcqCount,
      "Coding Score": 0,
      "Coding Total": codingCount,
      "Total Marks": Math.round(mcqCount * 0.4),
      "Max Marks": totalCount,
      "Percentage": 33,
      "Result Status": "FAILED",
      "Remarks": "Requires re-examination",
    },
  ];

  const ws = XLSX.utils.json_to_sheet(templateRows);
  ws["!cols"] = [
    { wch: 16 },
    { wch: 20 },
    { wch: 14 },
    { wch: 32 },
    { wch: 12 },
    { wch: 12 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 16 },
    { wch: 25 },
  ];

  XLSX.utils.book_append_sheet(wb, ws, "Marks_Import_Template");
  XLSX.writeFile(wb, "Student_Exam_Marks_Template.xlsx");
}

/**
 * Parses an uploaded Excel (.xlsx, .xls) or CSV file into structured student marks rows.
 */
export async function parseMarksExcelFile(file: File): Promise<ImportValidationSummary> {
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data, { type: "array" });

  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error("The uploaded Excel workbook contains no sheets.");
  }

  const worksheet = workbook.Sheets[firstSheetName];
  if (!worksheet) {
    throw new Error("Unable to read sheet data from the uploaded workbook.");
  }
  const rawRows: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

  if (rawRows.length === 0) {
    throw new Error("No data rows found in the uploaded spreadsheet.");
  }

  const db = loadDB();
  const errors: string[] = [];
  const parsedRows: ParsedMarksRow[] = [];

  rawRows.forEach((row, idx) => {
    // Normalise column keys (lowercase, stripped of spaces and symbols)
    const normalized: Record<string, any> = {};
    for (const [key, val] of Object.entries(row)) {
      const cleanKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
      normalized[cleanKey] = val;
    }

    const studentId = String(
      normalized["studentid"] ||
      normalized["rollno"] ||
      normalized["rollnumber"] ||
      normalized["regno"] ||
      normalized["registerno"] ||
      normalized["id"] ||
      ""
    ).trim();

    const studentName = String(
      normalized["candidatename"] ||
      normalized["studentname"] ||
      normalized["name"] ||
      normalized["candidate"] ||
      ""
    ).trim() || (studentId ? `Student ${studentId}` : `Candidate ${idx + 1}`);

    if (!studentId && !studentName) {
      // Empty row
      return;
    }

    const examId = String(
      normalized["examid"] ||
      normalized["examcode"] ||
      normalized["exam"] ||
      ""
    ).trim() || db.exams[0]?.id || "e1";

    const examTitle = String(
      normalized["examtitle"] ||
      normalized["title"] ||
      ""
    ).trim() || db.exams.find((e) => e.id === examId)?.title || "Proctored Examination";

    // Scores
    const mcqScore = Number(normalized["mcqscore"] || normalized["mcqmarks"] || normalized["mcq"] || 0);
    const mcqTotal = Number(normalized["mcqtotal"] || normalized["mcqmax"] || 10);
    const codingScore = Number(normalized["codingscore"] || normalized["codingmarks"] || normalized["coding"] || 0);
    const codingTotal = Number(normalized["codingtotal"] || normalized["codingmax"] || 2);

    let totalScore = Number(normalized["totalmarks"] || normalized["totalscore"] || normalized["marks"] || normalized["score"] || 0);
    let maxScore = Number(normalized["maxmarks"] || normalized["maxscore"] || normalized["maximummarks"] || normalized["total"] || 0);

    if (totalScore === 0 && (mcqScore > 0 || codingScore > 0)) {
      totalScore = Number((mcqScore + codingScore).toFixed(1));
    }
    if (maxScore === 0) {
      maxScore = mcqTotal + codingTotal > 0 ? mcqTotal + codingTotal : 100;
    }

    let percentage = Number(normalized["percentage"] || normalized["percent"] || 0);
    if (!percentage && maxScore > 0) {
      percentage = Math.round((totalScore / maxScore) * 100);
    }

    const rawStatus = String(normalized["resultstatus"] || normalized["status"] || normalized["grade"] || "").toUpperCase();
    const status: "PASSED" | "FAILED" = rawStatus.includes("FAIL") || percentage < 50 ? "FAILED" : "PASSED";

    const remarks = String(normalized["remarks"] || normalized["comments"] || "");

    const matchedExisting = db.sessions.some(
      (s) =>
        (studentId && s.studentId.toLowerCase() === studentId.toLowerCase()) ||
        (studentName && s.studentName.toLowerCase() === studentName.toLowerCase())
    );

    parsedRows.push({
      studentId: studentId || `stu_${idx + 1}`,
      studentName,
      examId,
      examTitle,
      mcqScore,
      mcqTotal,
      codingScore,
      codingTotal,
      totalScore,
      maxScore,
      percentage,
      status,
      remarks,
      matchedExisting,
    });
  });

  const matchedCount = parsedRows.filter((r) => r.matchedExisting).length;
  const newCount = parsedRows.length - matchedCount;

  return {
    rows: parsedRows,
    totalParsed: parsedRows.length,
    matchedCount,
    newCount,
    errors,
  };
}

/**
 * Saves/merges imported marks from Excel into the application database (`proctor-store`).
 */
export function applyImportedMarksToDatabase(
  rows: ParsedMarksRow[],
  targetExamId?: string
): { updatedCount: number; createdCount: number } {
  let updatedCount = 0;
  let createdCount = 0;

  updateDB((db) => {
    rows.forEach((row) => {
      const examId = targetExamId || row.examId || db.exams[0]?.id || "e1";
      const exam = db.exams.find((e) => e.id === examId) || db.exams[0]!;

      // Find existing session for this student and exam
      const existingSession = db.sessions.find(
        (s) =>
          s.examId === examId &&
          (s.studentId.toLowerCase() === row.studentId.toLowerCase() ||
           s.studentName.toLowerCase() === row.studentName.toLowerCase())
      );

      const scoreSummary: ExamScoreSummary = {
        mcqScore: row.mcqScore,
        mcqTotal: row.mcqTotal,
        codingScore: row.codingScore,
        codingTotal: row.codingTotal,
        totalScore: row.totalScore,
        maxScore: row.maxScore,
        percentage: row.percentage,
      };

      if (existingSession) {
        existingSession.scoreSummary = scoreSummary;
        existingSession.status = "completed";
        if (!existingSession.endedAt) {
          existingSession.endedAt = new Date().toISOString();
        }
        if (row.answers) {
          existingSession.answers = { ...existingSession.answers, ...row.answers };
        }
        updatedCount += 1;
      } else {
        // Create new session record
        const newSessionId = uid();
        const newSession: ExamSession = {
          id: newSessionId,
          studentId: row.studentId,
          studentName: row.studentName,
          examId: exam.id,
          examTitle: exam.title,
          startedAt: new Date(Date.now() - 3600000).toISOString(),
          endedAt: new Date().toISOString(),
          status: "completed",
          riskScore: 5,
          riskLevel: "green",
          reasons: ["Marks verified and imported via official Faculty/Admin Excel Grade Sheet."],
          answers: row.answers || {},
          scoreSummary,
          roomScanPassed: true,
          events: [
            {
              id: uid(),
              sessionId: newSessionId,
              type: "face_mismatch",
              label: "Marks Synchronized via Excel Roster",
              at: new Date().toISOString(),
              clock: new Date().toLocaleTimeString(),
              severity: 0,
            },
          ],
          metrics: {
            phoneSeconds: 0,
            bookSeconds: 0,
            multiPersonSeconds: 0,
            noFaceSeconds: 0,
            lookAwayCount: 0,
            headMovementCount: 0,
            voiceSeconds: 0,
            handEvents: 0,
            faceMismatchCount: 0,
            tabSwitches: row.tabSwitches ?? 0,
            fullscreenExits: row.fullscreenExits ?? 0,
          },
        };

        db.sessions.unshift(newSession);
        createdCount += 1;
      }
    });
  });

  return { updatedCount, createdCount };
}

/**
 * Exports a single student's complete exam scorecard, question answers,
 * and forensic proctoring audit log to an individual Microsoft Excel (.xlsx) file.
 */
export function exportSingleSessionExcel(
  session: ExamSession,
  filenamePrefix = "Student_Exam_Report"
) {
  const wb = XLSX.utils.book_new();
  const db = loadDB();
  const risk = computeRisk(session.metrics);
  const score = session.scoreSummary || {
    mcqScore: 0,
    mcqTotal: 0,
    codingScore: 0,
    codingTotal: 0,
    totalScore: 0,
    maxScore: 0,
    percentage: 0,
  };
  const isPassed = score.percentage >= 50;
  const tabSwitches = session.metrics?.tabSwitches ?? 0;
  const fullscreenExits =
    session.metrics?.fullscreenExits ??
    session.events?.filter(
      (e) =>
        (e.type as string) === "fullscreen_exit" ||
        e.label.toLowerCase().includes("fullscreen")
    ).length ??
    0;

  // Sheet 1: Student Overview & Exam Result
  const overviewRows = [
    { Field: "Student ID / Roll No", Value: session.studentId },
    { Field: "Candidate Name", Value: session.studentName },
    { Field: "Exam ID", Value: session.examId },
    { Field: "Exam Title", Value: session.examTitle },
    { Field: "MCQ Marks Obtained", Value: `${score.mcqScore} / ${score.mcqTotal}` },
    { Field: "Coding Marks Obtained", Value: `${score.codingScore} / ${score.codingTotal}` },
    { Field: "Total Marks Obtained", Value: `${score.totalScore} / ${score.maxScore}` },
    { Field: "Percentage Scored", Value: `${score.percentage}%` },
    { Field: "Academic Grade / Result", Value: isPassed ? "PASSED" : "FAILED" },
    {
      Field: "Academic Status",
      Value: score.percentage >= 75 ? "Distinction" : score.percentage >= 50 ? "Pass" : "Fail / Reappear",
    },
    { Field: "Final Integrity Score", Value: `${risk.score}%` },
    { Field: "Integrity Category", Value: risk.category },
    { Field: "Integrity Verdict", Value: risk.verdict },
    { Field: "Faculty Recommendation", Value: risk.recommendation },
    { Field: "Tab Switches Count", Value: tabSwitches },
    { Field: "Fullscreen Exit Count", Value: fullscreenExits },
    { Field: "Session State", Value: session.status.toUpperCase() },
    { Field: "Session Started At", Value: new Date(session.startedAt).toLocaleString() },
    {
      Field: "Session Submitted At",
      Value: session.endedAt ? new Date(session.endedAt).toLocaleString() : "Ongoing / In Progress",
    },
    { Field: "Faculty Review Status", Value: (session as any).review?.status ?? "Pending Review" },
    { Field: "Faculty Official Remarks", Value: (session as any).review?.comment ?? "N/A" },
  ];

  const wsOverview = XLSX.utils.json_to_sheet(overviewRows);
  wsOverview["!cols"] = [{ wch: 30 }, { wch: 48 }];
  XLSX.utils.book_append_sheet(wb, wsOverview, "Student Marks Overview");

  // Sheet 2: Question-by-Question Answers Breakdown
  const exam = db.exams.find((e) => e.id === session.examId);
  if (exam && exam.questions && exam.questions.length > 0) {
    const answerRows = exam.questions.map((q, idx) => {
      const selected = session.answers ? session.answers[q.id] : undefined;
      const selectedText =
        selected !== undefined
          ? q.options[selected] ?? `Option ${selected + 1}`
          : "Not Answered";
      const correctText = q.options[q.answer] ?? `Option ${q.answer + 1}`;
      const isCorrect = selected === q.answer;

      return {
        "Q.No": idx + 1,
        "Question Prompt": q.text,
        "Candidate Selected Option":
          selected !== undefined ? `Option ${String.fromCharCode(65 + selected)}` : "None",
        "Candidate Answer Text": selectedText,
        "Correct Option": `Option ${String.fromCharCode(65 + q.answer)}`,
        "Correct Answer Text": correctText,
        "Evaluation": isCorrect ? "CORRECT (+1)" : "INCORRECT (0)",
        "Points Awarded": isCorrect ? (q.points ?? 1) : 0,
      };
    });

    const wsAnswers = XLSX.utils.json_to_sheet(answerRows);
    wsAnswers["!cols"] = [
      { wch: 8 },
      { wch: 48 },
      { wch: 26 },
      { wch: 30 },
      { wch: 18 },
      { wch: 30 },
      { wch: 18 },
      { wch: 14 },
    ];
    XLSX.utils.book_append_sheet(wb, wsAnswers, "Question-Level Answers");
  }

  // Sheet 3: Forensic Event Log
  if (session.events && session.events.length > 0) {
    const eventRows = session.events.map((e, idx) => ({
      "S.No": idx + 1,
      "Clock Time": e.clock || (e.at ? new Date(e.at).toLocaleTimeString() : "--"),
      "Event Type": e.type || (e as any).eventType || "GENERAL",
      "Severity": e.severity ?? 0,
      "Event Description": e.label || "Flagged observation",
      "Duration (s)": (e as any).durationSec ?? (e as any).duration ?? 0,
      "Evidence Attached": e.evidence ? "Visual Evidence Captured" : "Sensor Telemetry",
    }));

    const wsEvents = XLSX.utils.json_to_sheet(eventRows);
    wsEvents["!cols"] = [
      { wch: 8 },
      { wch: 14 },
      { wch: 22 },
      { wch: 14 },
      { wch: 44 },
      { wch: 14 },
      { wch: 24 },
    ];
    XLSX.utils.book_append_sheet(wb, wsEvents, "Forensic Audit Log");
  }

  const cleanName = session.studentName.replace(/[^a-zA-Z0-9]/g, "_");
  const filename = `${filenamePrefix}_${cleanName}_${session.studentId}.xlsx`;
  XLSX.writeFile(wb, filename);
}

