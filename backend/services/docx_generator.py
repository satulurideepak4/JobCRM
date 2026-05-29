"""
Generate formatted .docx files from tailored resume data.

Two modes:
  1. Template mode (preferred): opens the user's uploaded resume_base.docx,
     replaces ONLY the summary paragraph and bullet points under each company.
     Layout, fonts, spacing, hyperlinks and everything else is untouched.

  2. Scratch mode (fallback): builds a clean professional document when no
     template is available.
"""

import io
import os
import copy
from typing import Dict

from docx import Document
from docx.shared import Pt, RGBColor, Inches
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

_BLUE_DARK = RGBColor(0x1F, 0x4E, 0x79)
_BLUE_MID  = RGBColor(0x2E, 0x74, 0xB5)
_GREY      = RGBColor(0x60, 0x60, 0x60)

TEMPLATE_PATH = "uploads/resume_base.docx"

# Known company anchors — used to locate sections in the template
_COMPANY_ANCHORS = ["apiwiz", "align technology"]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _para_full_text(para) -> str:
    """Full visible text of a paragraph including text inside hyperlinks."""
    return "".join(
        node.text or ""
        for node in para._p.iter()
        if node.tag.endswith("}t")
    )


def _is_bullet(para) -> bool:
    text = para.text.strip()
    return (
        para.style.name.lower().startswith("list")
        or text.startswith("•")
        or text.startswith("▪")
        or text.startswith("–")
        or text.startswith("-")
    )


def _is_section_header(para) -> bool:
    """Detect bold all-caps short paragraphs (section headers)."""
    text = para.text.strip()
    if not text:
        return False
    if len(text) > 60:
        return False
    # ALL CAPS or mostly bold → likely a header
    return text.isupper() or all(r.bold for r in para.runs if r.text.strip())


def _replace_para_text(para, new_text: str):
    """
    Replace the visible text of *para* while preserving run-level formatting.

    Only modifies <w:r> elements that are DIRECT children of <w:p>.
    Runs nested inside <w:hyperlink> elements are left completely untouched,
    so hyperlinks survive unchanged.
    """
    # Direct-child runs only (excludes hyperlink runs)
    direct_runs = [child for child in para._p if child.tag == qn("w:r")]
    if not direct_runs:
        return  # nothing to replace (e.g. pure hyperlink paragraph)

    # If the bullet prefix is a separate run, keep it as-is and put
    # new text in the next run (or first if there's only one).
    first_text_run = None
    for r in direct_runs:
        t_els = r.findall(qn("w:t"))
        if t_els and any(t.text and t.text.strip() not in ("•", "▪", "–", "-") for t in t_els):
            first_text_run = r
            break

    target_run = first_text_run or direct_runs[0]

    # Wipe text from all direct runs except the target
    for r in direct_runs:
        if r is not target_run:
            for t in r.findall(qn("w:t")):
                t.text = ""

    # Set new text on the target run
    t_els = target_run.findall(qn("w:t"))
    if t_els:
        t_els[0].text = new_text
        if " " in new_text or new_text.startswith(" ") or new_text.endswith(" "):
            t_els[0].set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        # Clear any additional <w:t> in same run
        for extra in t_els[1:]:
            extra.text = ""
    else:
        # Create a <w:t> element
        t_el = OxmlElement("w:t")
        t_el.text = new_text
        if " " in new_text:
            t_el.set("{http://www.w3.org/XML/1998/namespace}space", "preserve")
        target_run.append(t_el)


def _clone_para_after(ref_para, new_text: str) -> None:
    """
    Insert a new paragraph immediately after *ref_para* cloning its XML
    (style, indent, spacing) but with *new_text* as content.
    Used when the LLM produces more bullets than the original template has.
    """
    p_elem = copy.deepcopy(ref_para._p)
    # Wipe all run text then set new_text
    for r in p_elem.findall(qn("w:r")):
        for t in r.findall(qn("w:t")):
            t.text = ""
    # Set text on first run
    runs = p_elem.findall(qn("w:r"))
    if runs:
        t_els = runs[0].findall(qn("w:t"))
        if t_els:
            t_els[0].text = new_text
        else:
            t_el = OxmlElement("w:t")
            t_el.text = new_text
            runs[0].append(t_el)
    ref_para._p.addnext(p_elem)


# ── Template-based generation ─────────────────────────────────────────────────

def _has_hyperlinks(para) -> bool:
    """Return True if this paragraph contains any hyperlink XML elements."""
    return bool(para._p.findall(qn("w:hyperlink")))


def _apply_to_template(data: Dict) -> bytes:
    """Open resume_base.docx and replace only summary + bullets."""
    doc = Document(TEMPLATE_PATH)
    paras = doc.paragraphs

    # ── 1. Replace summary ────────────────────────────────────────────────────
    # Strategy: find a section header that contains "summary", then replace the
    # first long non-header non-hyperlink paragraph that follows it.
    # This avoids accidentally clobbering the intro/tagline row (which holds links).
    new_summary = data.get("tailored_summary", "").strip()
    if new_summary:
        summary_replaced = False
        # Pass 1: look for explicit "summary" header anchor
        for i, para in enumerate(paras):
            header_text = _para_full_text(para).lower()
            if _is_section_header(para) and "summary" in header_text:
                for candidate in paras[i + 1 : i + 6]:
                    text = _para_full_text(candidate).strip()
                    if (
                        text
                        and len(text) > 60
                        and not _is_section_header(candidate)
                        and not _is_bullet(candidate)
                        and not _has_hyperlinks(candidate)
                    ):
                        _replace_para_text(candidate, new_summary)
                        summary_replaced = True
                        break
                if summary_replaced:
                    break

        # Pass 2 fallback: first long non-header non-bullet non-hyperlink paragraph
        if not summary_replaced:
            for para in paras[:30]:
                text = _para_full_text(para).strip()
                if (
                    len(text) > 100
                    and not _is_bullet(para)
                    and not _is_section_header(para)
                    and not _has_hyperlinks(para)
                ):
                    _replace_para_text(para, new_summary)
                    break

    # ── 2. Replace bullets per company ───────────────────────────────────────
    for exp in data.get("experience", []):
        company  = (exp.get("company") or "").strip()
        new_bullets = [b for b in exp.get("bullets", []) if b.strip()]
        if not company or not new_bullets:
            continue

        # Find the paragraph that names this company
        company_para_idx = None
        for i, para in enumerate(paras):
            if company.lower() in _para_full_text(para).lower():
                company_para_idx = i
                break

        if company_para_idx is None:
            continue  # company not found in template — skip

        # Collect all bullet paragraphs that follow the company paragraph
        # Stop at next section header, next company, or end of doc
        bullet_paras = []
        for para in paras[company_para_idx + 1 :]:
            full = _para_full_text(para).strip()
            if not full:
                continue
            if _is_section_header(para):
                break
            # Stop if we hit another company heading
            if any(anchor in full.lower() for anchor in _COMPANY_ANCHORS if anchor != company.lower()):
                break
            if _is_bullet(para):
                bullet_paras.append(para)

        if not bullet_paras:
            continue

        # Replace existing bullet paragraphs with new bullets.
        # Preserve layout exactly: do not add/remove bullet rows.
        for i, para in enumerate(bullet_paras):
            if i < len(new_bullets):
                _replace_para_text(para, new_bullets[i])
            # If LLM returned fewer bullets, keep remaining original bullets as-is.

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf.read()


# ── Scratch-mode generation (fallback) ────────────────────────────────────────

def _font(run, size=10, bold=False, color=None, name="Calibri"):
    run.font.name = name
    run.font.size = Pt(size)
    run.font.bold = bold
    if color:
        run.font.color.rgb = color


def _section_header(doc, text):
    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after  = Pt(3)
    run = p.add_run(text.upper())
    _font(run, size=9, bold=True, color=_BLUE_MID)
    pPr  = p._p.get_or_add_pPr()
    pBdr = OxmlElement("w:pBdr")
    bot  = OxmlElement("w:bottom")
    bot.set(qn("w:val"),   "single")
    bot.set(qn("w:sz"),    "6")
    bot.set(qn("w:space"), "1")
    bot.set(qn("w:color"), "2E74B5")
    pBdr.append(bot)
    pPr.append(pBdr)


def _bullet(doc, text):
    p = doc.add_paragraph(style="List Bullet")
    p.paragraph_format.left_indent = Inches(0.2)
    p.paragraph_format.space_after = Pt(2)
    run = p.add_run(text)
    _font(run, size=10)


def _build_from_scratch(data: Dict) -> bytes:
    doc = Document()

    for section in doc.sections:
        section.top_margin    = Inches(0.75)
        section.bottom_margin = Inches(0.75)
        section.left_margin   = Inches(1.0)
        section.right_margin  = Inches(1.0)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    _font(p.add_run("Deepak Satuluri"), size=22, bold=True, color=_BLUE_DARK)

    role = (data.get("experience") or [{}])[0].get("role", "Senior Backend Engineer")
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(2)
    _font(p.add_run(role), size=11, color=_BLUE_MID)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.paragraph_format.space_after = Pt(6)
    _font(p.add_run(
        "satulurideepak4@gmail.com  •  +91 7095918889  •  Bengaluru, India  •  "
        "linkedin.com/in/satuluri-deepak-69227a1a1  •  github.com/satulurideepak4"
    ), size=8, color=_GREY)

    _section_header(doc, "Professional Summary")
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(4)
    _font(p.add_run(data.get("tailored_summary", "")), size=10)

    keywords = data.get("keywords_matched", [])
    if keywords:
        _section_header(doc, "Core Competencies")
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(4)
        _font(p.add_run("  •  ".join(keywords)), size=9, color=_GREY)

    skills = data.get("skills", [])
    if skills:
        _section_header(doc, "Technical Skills")
        tbl = doc.add_table(rows=len(skills), cols=2)
        tbl.style = "Table Grid"
        for i, row_data in enumerate(skills):
            cells = tbl.rows[i].cells
            cells[0].width = Inches(1.6)
            _font(cells[0].paragraphs[0].add_run(row_data.get("category", "")), size=9, bold=True)
            _font(cells[1].paragraphs[0].add_run(", ".join(row_data.get("items", []))), size=9)
        doc.add_paragraph()

    _section_header(doc, "Professional Experience")
    for exp in data.get("experience", []):
        p = doc.add_paragraph()
        p.paragraph_format.space_after = Pt(0)
        _font(p.add_run(exp.get("company", "")), size=11, bold=True)
        _font(p.add_run(f"   {exp.get('period', '')}"), size=9, color=_GREY)
        p2 = doc.add_paragraph()
        p2.paragraph_format.space_after = Pt(2)
        _font(p2.add_run(exp.get("role", "")), size=10, color=_BLUE_MID)
        for bullet in exp.get("bullets", []):
            _bullet(doc, bullet)

    projects = data.get("projects", [])
    if projects:
        _section_header(doc, "Key Projects")
        for proj in projects:
            p = doc.add_paragraph()
            p.paragraph_format.space_after = Pt(0)
            _font(p.add_run(proj.get("name", "")), size=10, bold=True)
            _font(p.add_run(f"   {proj.get('tech', '')}"), size=9, color=_GREY)
            for bullet in proj.get("bullets", []):
                _bullet(doc, bullet)

    _section_header(doc, "Education")
    p = doc.add_paragraph()
    _font(p.add_run("IIIT Andhra Pradesh"), size=10, bold=True)
    _font(p.add_run("   B.Tech Computer Science  •  GPA: 7.94/10  •  2018-2022"), size=9, color=_GREY)

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf.read()


# ── Public API ────────────────────────────────────────────────────────────────

def generate_resume_docx(data: Dict, company_name: str = "") -> bytes:
    """
    Generate tailored resume .docx.
    Uses template if uploads/resume_base.docx exists, otherwise builds from scratch.
    """
    if os.path.exists(TEMPLATE_PATH):
        try:
            return _apply_to_template(data)
        except Exception as e:
            import logging
            logging.getLogger(__name__).warning(
                f"Template-based generation failed ({e}), falling back to scratch mode"
            )
    return _build_from_scratch(data)


def generate_cover_letter_docx(cover_letter: str, company_name: str = "") -> bytes:
    doc = Document()

    for section in doc.sections:
        section.top_margin    = Inches(1.0)
        section.bottom_margin = Inches(1.0)
        section.left_margin   = Inches(1.2)
        section.right_margin  = Inches(1.2)

    p = doc.add_paragraph()
    _font(p.add_run("Deepak Satuluri"), size=16, bold=True, color=_BLUE_DARK)

    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(16)
    _font(p.add_run(
        "satulurideepak4@gmail.com  •  +91 7095918889  •  Bengaluru, India"
    ), size=9, color=_GREY)

    for para in cover_letter.strip().split("\n\n"):
        if para.strip():
            p = doc.add_paragraph()
            p.paragraph_format.space_after = Pt(10)
            _font(p.add_run(para.strip()), size=11)

    p = doc.add_paragraph()
    p.paragraph_format.space_before = Pt(16)
    _font(p.add_run("Sincerely,\nDeepak Satuluri"), size=11)

    buf = io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf.read()
