package org.jahia.support.modulemanagement.services;

import org.junit.Assume;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.nio.file.Files;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import java.util.zip.ZipOutputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * S3 / S4 / S5 / S6 — archive-import hardening (zip-slip, extension allowlist, canonical-path
 * containment, zip-bomb cumulative byte cap). U13 / U11 — security-critical.
 *
 * <p>Note on real behaviour: {@code resolveSafeZipEntry} <em>rejects by returning {@code null}</em>
 * (the caller then skips the entry — nothing is written) rather than throwing. These tests assert
 * that real reject-by-null behaviour, which is what actually protects the filesystem.
 */
public class ZipHardeningTest {

    // MAX_TOTAL_UNCOMPRESSED_BYTES is a private constant (1 GiB). We seed the running counter close
    // to it and feed a few KB so the cap is crossed without allocating a gigabyte in the test.
    private static final long MAX_TOTAL_UNCOMPRESSED_BYTES = 1024L * 1024 * 1024;

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private final ModuleManagementCommunityServiceImpl service = new ModuleManagementCommunityServiceImpl();

    // ── S3: zip-slip path traversal ───────────────────────────────────────────────
    @Test
    public void resolveSafeZipEntry_pathTraversalEntries_rejected() throws Exception {
        File root = tmp.newFolder("extract");

        assertThat(service.resolveSafeZipEntry("../evil.jar", root)).isNull();
        assertThat(service.resolveSafeZipEntry("foo/../../evil.jar", root)).isNull();
        assertThat(service.resolveSafeZipEntry("/etc/evil.jar", root)).isNull();
    }

    // ── S4: extension allowlist ───────────────────────────────────────────────────
    @Test
    public void resolveSafeZipEntry_disallowedExtensions_rejected() throws Exception {
        File root = tmp.newFolder("extract");

        assertThat(service.resolveSafeZipEntry("payload.sh", root)).isNull();
        assertThat(service.resolveSafeZipEntry("run.exe", root)).isNull();
        assertThat(service.resolveSafeZipEntry("config.properties", root)).isNull();
    }

    @Test
    public void resolveSafeZipEntry_allowedExtensions_returnPathUnderRoot() throws Exception {
        File root = tmp.newFolder("extract");

        for (String name : new String[]{"mod.jar", "provisioning.yaml", "x.yml"}) {
            File resolved = service.resolveSafeZipEntry(name, root);
            assertThat(resolved).as(name).isNotNull();
            assertThat(resolved.getCanonicalPath())
                    .startsWith(root.getCanonicalPath() + File.separator);
        }
    }

    // ── S5: canonical-path escape without a literal ".." (symlink) ────────────────
    @Test
    public void resolveSafeZipEntry_canonicalEscapeViaSymlink_rejected() throws Exception {
        File root = tmp.newFolder("extract");
        File outside = tmp.newFolder("outside");
        File link = new File(root, "escape");
        try {
            Files.createSymbolicLink(link.toPath(), outside.toPath());
        } catch (UnsupportedOperationException | IOException e) {
            Assume.assumeNoException("Filesystem does not support symlinks", e);
        }

        // Entry name has no ".." and no leading "/", but resolves (through the symlink) outside root.
        File resolved = service.resolveSafeZipEntry("escape/evil.jar", root);
        assertThat(resolved).isNull();
    }

    // ── S6: zip-bomb cumulative uncompressed-byte cap ─────────────────────────────
    @Test
    public void copyZipEntry_exceedingCumulativeByteCap_abortsAndCleansUp() throws Exception {
        File root = tmp.newFolder("extract");
        File out = new File(root, "out.bin");

        // A real single-entry zip carrying a few KB of payload.
        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        try (ZipOutputStream zos = new ZipOutputStream(baos)) {
            zos.putNextEntry(new ZipEntry("big.bin"));
            zos.write(new byte[8192]);
            zos.closeEntry();
        }
        ZipInputStream zis = new ZipInputStream(new ByteArrayInputStream(baos.toByteArray()));
        zis.getNextEntry();

        // Seed the running total 10 bytes below the cap so the first read crosses it.
        long seed = MAX_TOTAL_UNCOMPRESSED_BYTES - 10;

        assertThatThrownBy(() -> service.copyZipEntry(zis, out, root, seed))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("zip bomb");

        // abortExtraction must have deleted the partial extraction directory.
        assertThat(root).doesNotExist();
    }

    @Test
    public void abortExtraction_deletesTargetDirAndThrows() throws Exception {
        File root = tmp.newFolder("extract");
        assertThat(root).exists();

        assertThatThrownBy(() -> service.abortExtraction(root, "test reason"))
                .isInstanceOf(IOException.class)
                .hasMessageContaining("zip bomb");
        assertThat(root).doesNotExist();
    }
}
