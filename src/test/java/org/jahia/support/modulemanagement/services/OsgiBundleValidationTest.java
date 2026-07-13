package org.jahia.support.modulemanagement.services;

import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

import java.io.File;
import java.io.FileOutputStream;
import java.util.jar.JarOutputStream;
import java.util.jar.Manifest;
import java.util.zip.ZipEntry;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * S1 / S2 — {@code validateOsgiBundle} (the guard run on every JAR pulled from JCR or uploaded
 * before it is installed as an OSGi bundle). U12, dependency of F5/F10.
 */
public class OsgiBundleValidationTest {

    @Rule
    public TemporaryFolder tmp = new TemporaryFolder();

    private final ModuleManagementCommunityServiceImpl service = new ModuleManagementCommunityServiceImpl();

    /** Builds a temp .jar carrying a MANIFEST.MF with the given Bundle-SymbolicName (null omits it). */
    private File jarWithSymbolicName(String symbolicName) throws Exception {
        Manifest manifest = new Manifest();
        manifest.getMainAttributes().putValue("Manifest-Version", "1.0");
        if (symbolicName != null) {
            manifest.getMainAttributes().putValue("Bundle-SymbolicName", symbolicName);
        }
        File jar = tmp.newFile("bundle-" + System.nanoTime() + ".jar");
        try (JarOutputStream jos = new JarOutputStream(new FileOutputStream(jar), manifest)) {
            jos.putNextEntry(new ZipEntry("dummy.txt"));
            jos.write("x".getBytes());
            jos.closeEntry();
        }
        return jar;
    }

    @Test
    public void validateOsgiBundle_wellFormedJar_returnsNormally() throws Exception {
        // Arrange
        File jar = jarWithSymbolicName("org.example.test");

        // Act + Assert — no exception is thrown for a well-formed OSGi bundle jar
        service.validateOsgiBundle(jar, jar.getName());
    }

    @Test
    public void validateOsgiBundle_nonJarExtension_rejected() throws Exception {
        // Arrange — a file whose name does not end in .jar
        File txt = tmp.newFile("payload.txt");

        // Act + Assert
        assertThatThrownBy(() -> service.validateOsgiBundle(txt, "payload.txt"))
                .isInstanceOf(java.io.IOException.class)
                .hasMessageContaining("Only .jar files are accepted");
    }

    @Test
    public void validateOsgiBundle_missingManifest_rejected() throws Exception {
        // Arrange — a .jar with NO META-INF/MANIFEST.MF
        File jar = tmp.newFile("nomanifest.jar");
        try (JarOutputStream jos = new JarOutputStream(new FileOutputStream(jar))) {
            jos.putNextEntry(new ZipEntry("data.txt"));
            jos.write("x".getBytes());
            jos.closeEntry();
        }

        // Act + Assert
        assertThatThrownBy(() -> service.validateOsgiBundle(jar, "nomanifest.jar"))
                .isInstanceOf(java.io.IOException.class)
                .hasMessageContaining("missing MANIFEST.MF");
    }

    @Test
    public void validateOsgiBundle_manifestWithoutSymbolicName_rejected() throws Exception {
        // Arrange — a .jar whose manifest has no Bundle-SymbolicName
        File jar = jarWithSymbolicName(null);

        // Act + Assert
        assertThatThrownBy(() -> service.validateOsgiBundle(jar, jar.getName()))
                .isInstanceOf(java.io.IOException.class)
                .hasMessageContaining("Bundle-SymbolicName");
    }

    @Test
    public void validateOsgiBundle_notAJarArchive_rejected() throws Exception {
        // Arrange — a .jar-named file that is not a real zip/jar archive
        File fake = tmp.newFile("fake.jar");
        try (FileOutputStream fos = new FileOutputStream(fake)) {
            fos.write("this is not a zip".getBytes());
        }

        // Act + Assert
        assertThatThrownBy(() -> service.validateOsgiBundle(fake, "fake.jar"))
                .isInstanceOf(java.io.IOException.class);
    }
}
