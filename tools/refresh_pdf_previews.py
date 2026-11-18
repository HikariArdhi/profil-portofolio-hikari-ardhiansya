#!/usr/bin/env python3
"""Regenerate the existing portfolio PDF previews without deleting old files."""

import argparse
import json
from pathlib import Path
import tempfile


def inside(root, relative):
    path = (root / relative).resolve()
    path.relative_to(root)
    return path


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--site-dir", type=Path, default=Path(__file__).resolve().parents[1] / "dist")
    parser.add_argument("--project", help="Project key; use --list to see available keys")
    parser.add_argument("--document", help="Document key, for example proposal or brd")
    parser.add_argument("--all", action="store_true", help="Refresh all documents in all projects")
    parser.add_argument("--list", action="store_true", help="List project and document keys")
    args = parser.parse_args()
    root = args.site_dir.resolve()
    manifest_path = root / "assets/document-reader/manifest.json"
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    projects = manifest["projects"]
    if args.list:
        for key, project in projects.items():
            print(f"{key}: {', '.join(project['documents'])}")
        return
    if args.all and (args.project or args.document):
        parser.error("Use --all on its own, or --project with an optional --document")
    if not args.all and not args.project:
        parser.error("Choose --project, --all, or --list")
    if args.project and args.project not in projects:
        parser.error("Unknown project; use --list")
    selected_projects = list(projects) if args.all else [args.project]
    if args.document and args.document not in projects[args.project]["documents"]:
        parser.error("Unknown document; use --list")
    try:
        import fitz
        from PIL import Image
    except ImportError:
        parser.error("Install optional tools first: python -m pip install -r tools/requirements-preview.txt")

    # Render all selected PDFs first. Existing files are kept until rendering succeeds.
    with tempfile.TemporaryDirectory(prefix="hikari-pdf-previews-") as temporary:
        staging = Path(temporary)
        pending = []
        for project_key in selected_projects:
            documents = projects[project_key]["documents"]
            selected_documents = [args.document] if args.document else list(documents)
            for document_key in selected_documents:
                document = documents[document_key]
                source_pdf = inside(root, document["pdf"])
                pages = []
                with fitz.open(source_pdf) as pdf:
                    if not len(pdf):
                        raise ValueError(f"Empty PDF: {source_pdf.name}")
                    for index, page in enumerate(pdf):
                        relative_image = f"assets/document-reader/{project_key}/{document_key}/page-{index + 1:02d}.webp"
                        destination = inside(root, relative_image)
                        staged_image = staging / relative_image
                        staged_image.parent.mkdir(parents=True, exist_ok=True)
                        pixels = page.get_pixmap(matrix=fitz.Matrix(2, 2), colorspace=fitz.csRGB, alpha=False)
                        image = Image.frombytes("RGB", (pixels.width, pixels.height), pixels.samples)
                        image.save(staged_image, "WEBP", quality=85, method=6)
                        pages.append({"image": relative_image, "width": pixels.width, "height": pixels.height, "text": page.get_text("text").strip()})
                        pending.append((staged_image, destination))
                document["pages"] = pages
                print(f"{project_key}/{document_key}: {len(pages)} pages")
        # Old surplus page images are retained; the manifest references only current pages.
        for source, destination in pending:
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_bytes(source.read_bytes())
        temporary_manifest = None
        try:
            with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=manifest_path.parent, delete=False, suffix=".tmp") as output:
                json.dump(manifest, output, ensure_ascii=False, indent=2)
                output.write("\n")
                temporary_manifest = Path(output.name)
            temporary_manifest.replace(manifest_path)
        finally:
            if temporary_manifest and temporary_manifest.exists():
                temporary_manifest.unlink()
    print("Done. Review locally, then commit and push the PDF, preview images, and manifest to GitHub.")


if __name__ == "__main__":
    main()
