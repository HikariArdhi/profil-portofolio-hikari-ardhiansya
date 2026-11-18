"use strict";
(() => {
  const byId = id => document.getElementById(id);
  const params = new URLSearchParams(location.search);
  const projectId = params.get("project");
  let documentId = params.get("doc");
  let currentPage = 1;
  let zoom = 1;
  let fitMode = params.get("view") === "width" ? "width" : "page";
  let layoutFrame = 0;
  let project;
  let doc;
  const stage = byId("reader-stage");
  const pageImage = byId("reader-page-image");

  function showError(message) {
    byId("reader-error-text").textContent = message;
    byId("reader-error").hidden = false;
    byId("reader-status").textContent = "Dokumen belum berhasil ditampilkan.";
    stage.setAttribute("aria-busy", "false");
  }

  function applyZoom() {
    if (!doc) return;
    const page = doc.pages[currentPage - 1];
    const viewportHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const documentTop = stage.getBoundingClientRect().top + window.scrollY;
    stage.style.setProperty("--reader-stage-height", `${Math.max(180, Math.floor(viewportHeight - documentTop - 14))}px`);
    const style = getComputedStyle(stage);
    const paddingX = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const paddingY = parseFloat(style.paddingTop) + parseFloat(style.paddingBottom);
    const availableWidth = Math.max(1, stage.clientWidth - paddingX - 1);
    const availableHeight = Math.max(1, stage.clientHeight - paddingY - 1);
    const baseWidth = fitMode === "page" ? Math.min(availableWidth, availableHeight * page.width / page.height) : availableWidth;
    const imageWidth = Math.max(1, Math.floor(baseWidth * zoom));
    const imageHeight = imageWidth * page.height / page.width;
    const verticalMargin = Math.max(0, Math.floor((availableHeight - imageHeight) / 2));
    pageImage.style.width = `${imageWidth}px`;
    pageImage.style.marginTop = `${verticalMargin}px`;
    pageImage.style.marginBottom = `${verticalMargin}px`;
    byId("reader-zoom-reset").textContent = `${Math.round(zoom * 100)}%`;
    byId("reader-zoom-out").disabled = zoom <= 0.5;
    byId("reader-zoom-in").disabled = zoom >= 3;
    byId("reader-hint").textContent = fitMode === "page" && zoom <= 1
      ? "Seluruh halaman ditampilkan utuh. Pilih Lebar layar atau tombol + untuk memperbesar."
      : "Geser area dokumen untuk membaca bagian lain. Pilih Halaman utuh untuk melihat seluruh halaman.";
  }

  function scheduleLayout() {
    cancelAnimationFrame(layoutFrame);
    layoutFrame = requestAnimationFrame(applyZoom);
  }

  function showPage(nextPage) {
    if (!doc) return;
    currentPage = Math.min(doc.pages.length, Math.max(1, nextPage));
    const page = doc.pages[currentPage - 1];
    byId("reader-error").hidden = true;
    byId("reader-page").value = String(currentPage);
    byId("reader-prev").disabled = currentPage === 1;
    byId("reader-next").disabled = currentPage === doc.pages.length;
    byId("reader-page-text").textContent = page.text || "Halaman ini berisi diagram atau elemen visual. Gunakan tampilan halaman untuk melihatnya.";
    stage.setAttribute("aria-busy", "true");
    byId("reader-status").textContent = `Memuat halaman ${currentPage} dari ${doc.pages.length}…`;
    pageImage.alt = `${doc.name}, halaman ${currentPage} dari ${doc.pages.length}, proyek ${project.name}`;
    pageImage.width = page.width;
    pageImage.height = page.height;
    pageImage.src = page.image;
    stage.scrollTop = 0;
    stage.scrollLeft = 0;
    const url = new URL(location.href);
    url.searchParams.set("page", String(currentPage));
    url.searchParams.set("view", fitMode);
    history.replaceState({}, "", url);
    applyZoom();
  }

  pageImage.addEventListener("load", () => {
    applyZoom();
    stage.setAttribute("aria-busy", "false");
    byId("reader-status").textContent = `Halaman ${currentPage} dari ${doc.pages.length}`;
  });
  pageImage.addEventListener("error", () => showError("Halaman belum berhasil dimuat. Coba muat ulang atau gunakan tombol Unduh PDF."));
  byId("reader-retry").addEventListener("click", () => location.reload());
  byId("reader-prev").addEventListener("click", () => showPage(currentPage - 1));
  byId("reader-next").addEventListener("click", () => showPage(currentPage + 1));
  byId("reader-page").addEventListener("change", event => showPage(Number(event.target.value)));
  byId("reader-zoom-in").addEventListener("click", () => { zoom = Math.min(3, zoom + 0.25); applyZoom(); });
  byId("reader-zoom-out").addEventListener("click", () => { zoom = Math.max(0.5, zoom - 0.25); applyZoom(); });
  byId("reader-zoom-reset").addEventListener("click", () => { zoom = 1; applyZoom(); stage.scrollLeft = 0; stage.scrollTop = 0; });
  byId("reader-fit").addEventListener("change", event => {
    fitMode = event.target.value === "width" ? "width" : "page";
    zoom = 1;
    const url = new URL(location.href);
    url.searchParams.set("view", fitMode);
    history.replaceState({}, "", url);
    applyZoom();
    stage.scrollLeft = 0;
    stage.scrollTop = 0;
  });
  byId("reader-document").addEventListener("change", event => {
    const url = new URL("reader.html", location.href);
    url.searchParams.set("project", projectId);
    url.searchParams.set("doc", event.target.value);
    url.searchParams.set("view", fitMode);
    location.assign(url);
  });
  window.addEventListener("resize", scheduleLayout);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", scheduleLayout);
  const layoutObserver = new ResizeObserver(scheduleLayout);
  layoutObserver.observe(byId("reader-toolbar"));
  layoutObserver.observe(document.querySelector(".reader-heading"));
  document.addEventListener("keydown", event => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest("input,select,button,summary")) return;
    if (event.key === "ArrowRight") { event.preventDefault(); showPage(currentPage + 1); }
    if (event.key === "ArrowLeft") { event.preventDefault(); showPage(currentPage - 1); }
  });

  async function init() {
    try {
      const response = await fetch("assets/document-reader/manifest.json");
      if (!response.ok) throw new Error("manifest-unavailable");
      const manifest = await response.json();
      project = Object.hasOwn(manifest.projects, projectId) ? manifest.projects[projectId] : null;
      // Hidden document files stay in the manifest; the reader opens a visible document instead.
      if (project && documentId === "case-study") {
        const fallback = Object.keys(project.documents).find(key => key !== "case-study");
        if (fallback) {
          documentId = fallback;
          params.set("page", "1");
          const url = new URL(location.href);
          url.searchParams.set("doc", documentId);
          history.replaceState({}, "", url);
        }
      }
      doc = project && Object.hasOwn(project.documents, documentId) ? project.documents[documentId] : null;
      if (!doc || !doc.pages.length) {
        byId("reader-title").textContent = "Dokumen tidak ditemukan";
        showError("Pilih dokumen dari halaman portofolio untuk membukanya kembali.");
        byId("reader-retry").hidden = true;
        return;
      }
      document.title = `${doc.name} — ${project.name} | Hikari Ardhiansya`;
      byId("reader-title").textContent = doc.name;
      byId("reader-project").textContent = project.name;
      byId("reader-meta").textContent = `Versi ${project.version} · ${doc.pages.length} halaman · Dokumentasi portofolio`;
      byId("reader-back").href = `index.html?project=${encodeURIComponent(project.appProjectId)}&tab=documents`;
      const download = byId("reader-download");
      download.href = doc.pdf;
      download.download = doc.pdf.split("/").pop();
      download.hidden = false;
      for (const [key, item] of Object.entries(project.documents)) {
        if (key === "case-study") continue;
        const option = document.createElement("option");
        option.value = key;
        option.textContent = item.name;
        byId("reader-document").append(option);
      }
      byId("reader-document").value = documentId;
      byId("reader-fit").value = fitMode;
      for (let page = 1; page <= doc.pages.length; page++) {
        const option = document.createElement("option");
        option.value = String(page);
        option.textContent = String(page);
        byId("reader-page").append(option);
      }
      byId("reader-page-total").textContent = `/ ${doc.pages.length}`;
      byId("reader-content").hidden = false;
      const requestedPage = Number(params.get("page"));
      showPage(Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1);
    } catch (error) {
      byId("reader-title").textContent = "Dokumen belum dapat dibuka";
      showError("Daftar dokumen belum berhasil dimuat. Silakan muat ulang halaman.");
    }
  }
  init();
})();
