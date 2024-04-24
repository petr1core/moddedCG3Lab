#version 130

// vecs & params uniforms
uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform vec3 u_pos;
uniform float u_time;
uniform vec2 u_seed1;
uniform vec2 u_seed2;
uniform int u_samples;
uniform vec2 u_light;

// const params
const float MAX_DIST = 500.0;     // ��������� ������� || ������� ��������� || ����� ����
const int MAX_REF = 6;         // ���-�� ���������
const int WHITE_BRIGHTNESS = 50;   // w ����� ����, ������� ����� ����������� (�������������?????)

// tex uniforms
uniform sampler2D u_texture;
uniform sampler2D u_brick_texture;
uniform sampler2D u_wood_texture;
uniform sampler2D u_marble_texture;

vec3 light = normalize(vec3(0.0, u_light.x, u_light.y));   // ����������� �����, ����������������� ������
uvec4 R_STATE;                                         // �������� ����. 4-�������(xyzw)

// TausStep � LCGStep, ��������������� � ��������� �������� ����� https://www.shadertoy.com/view/4lfBzn (taus + lcgstep)
uint TausStep(uint z, int S1, int S2, int S3, uint M)
{
	uint b = (((z << S1) ^ z) >> S2);
	return (((z & M) << S3) ^ b);
}

uint LCGStep(uint z, uint A, uint C)
{
	return (A * z + C);	
}
//----

// ����������� �������
vec2 hash22(vec2 p)
{
	p += u_seed1.x;
	vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
	p3 += dot(p3, p3.yzx+33.33);
	return fract((p3.xx+p3.yz)*p3.zy);
}

// �-� ��������� ����. �����
float random()
{
	R_STATE.x = TausStep(R_STATE.x, 13, 19, 12, uint(4294967294));
	R_STATE.y = TausStep(R_STATE.y, 2, 25, 4, uint(4294967288));
	R_STATE.z = TausStep(R_STATE.z, 3, 11, 17, uint(4294967280));
	R_STATE.w = LCGStep(R_STATE.w, uint(1664525), uint(1013904223));
	return 2.3283064365387e-10 * float((R_STATE.x ^ R_STATE.y ^ R_STATE.z ^ R_STATE.w));
}

// ��������� ���� ����� �������� � ���� x
float atan2(vec2 dir)
{
    float angle = asin(dir.x) > 0 ? acos(dir.y) : -acos(dir.y);
    return angle;
}

// ������ ��������� �������� ������� (x - ��������� ���������, t - ������ ��������, � d - �������� ����� �������)
float linearMotion(float x, float t, float d) 
{
	if (u_time < d) return 0.0;                                // ���� ������� ����� ������ �������� -> �������� ��� �� �������� -> ������ �� ������
	float time = (u_time - d) - (t * floor((u_time - d) / t));    // ����� �������� � ������ ��������
	float dist = x * (time / t);                              // ���������� ���������� � �������� �������
	if (time < t / 2.0) return dist;
	else return -dist + x;
}

// ������ ��������� �������� ������� (x - ��������� �������, t - ������ ��������, � d - �������� ����� �������)
vec2 rotation(float r, float t, float d)
{
	float time = (u_time - d) - (t * floor((u_time - d) / t));
	if (u_time < d) time = 0;
	float angle = 360 * (time / t) * (3.1415926 / 180);
	float x = r * cos(angle);
	float y = r * sin(angle);
	return vec2(x, y);
}

// ���������� ��������� ����� �� ����������� �����
vec3 randomOnSphere() {
	vec3 rand = vec3(random(), random(), random());
	float theta = rand.x * 2.0 * 3.14159265;
	float v = rand.y;
	float phi = acos(2.0 * v - 1.0);
	float r = pow(rand.z, 1.0 / 3.0);
	float x = r * sin(phi) * cos(theta);
	float y = r * sin(phi) * sin(theta);
	float z = r * cos(phi);
	return vec3(x, y, z);
}

// ������� �������� �� a(deg)
mat2 rot(float a) {  
	float s = sin(a);
	float c = cos(a);
	return mat2(c, -s, s, c);
}

// ����������� ���� � ������
vec2 sphIntersect(in vec3 ro, in vec3 rd, float ra) {
	float b = dot(ro, rd);
	float c = dot(ro, ro) - ra * ra;
	float h = b * b - c;
	if(h < 0.0) return vec2(-1.0);
	h = sqrt(h);
	return vec2(-b - h, -b + h);
}

// ����������� ��?? ���� � ������
bool has_sphIntersection (vec3 ro, vec3 rd, vec4 sph) {
    vec3 v = ro - sph.xyz;
    float b = 2.0 * dot(rd, v);
    float c = dot(v, v) - (sph.w * sph.w);
    float discriminant = (b * b) - (4.0 * c);
    if (discriminant < 0.0f) { return false; }
    discriminant = sqrt(discriminant);
    float s0 = (-b + discriminant) / 2.0;
    float s1 = (-b - discriminant) / 2.0;
    return s0 >= 0.0f || s1 >= 0.0f;
}

// ����������� ���� � �����
vec2 boxIntersection(in vec3 ro, in vec3 rd, in vec3 rad, out vec3 oN)  {
	vec3 m = 1.0 / rd;
	vec3 n = m * ro;
	vec3 k = abs(m) * rad;
	vec3 t1 = -n - k;
	vec3 t2 = -n + k;
	float tN = max(max(t1.x, t1.y), t1.z);
	float tF = min(min(t2.x, t2.y), t2.z);
	if(tN > tF || tF < 0.0) return vec2(-1.0);
	oN = -sign(rd) * step(t1.yzx, t1.xyz) * step(t1.zxy, t1.xyz);
	return vec2(tN, tF);
}

// ����������� ���� � ����������
float plaIntersect(in vec3 ro, in vec3 rd, in vec4 p) {
	return -(dot(ro, p.xyz) + p.w) / dot(rd, p.xyz);
}

// ����������� ���� � ������
vec3 triIntersection(in vec3 ro, in vec3 rd, in vec3 v0, in vec3 v1, in vec3 v2) {
	vec3 v1v0 = v1 - v0;
	vec3 v2v0 = v2 - v0;
	vec3 rov0 = ro - v0;
	vec3 n = cross(v1v0, v2v0);
	vec3 q = cross(rov0, rd);
	float d = 1.0 / dot(rd, n);
	float u = d * dot(-q, v2v0);
	float v = d * dot(q, v1v0);
	float t = d * dot(-n, rov0);
	if (u < 0.0 || u > 1.0 || v < 0.0 || (u + v) > 1.0) {
		t = -1.0;
	}
	return vec3(t, u, v);
}

// ����������� ���� � ����������
vec4 cylIntersection(in vec3 ro, in vec3 rd, in vec3 pa, in vec3 pb, float ra) {
	vec3 ca = pb - pa;
	vec3 oc = ro - pa;
	float caca = dot(ca, ca);
	float card = dot(ca, rd);
	float caoc = dot(ca, oc);
	float a = caca - card * card;;
	float b = caca * dot(oc, rd) - caoc * card;
	float c = caca * dot(oc, oc) - caoc * caoc - ra * ra * caca;
	float h = b * b - a * c;
	if (h < 0.0) return vec4(-1.0);
	h = sqrt(h);
	float t = (-b-h) / a;
	float y = caoc + t * card;
	if (y > 0.0 && y < caca) return vec4(t, (oc + t * rd - ca * y / caca) / ra);
	t = (((y < 0.0) ? 0.0 : caca) - caoc) / card;
	if (abs(b + a * t) < h) return vec4(t, ca * sign(y) / caca);
	return vec4(-1.0);
}

// ���� ������� ���� � ����������� �� ����������� ���� � ���������
vec3 getSky(vec3 rd) {             
	vec3 col = vec3(0.4, 0.6, 1.0);
	vec3 sun = vec3(0.95, 0.9, 1.0);
	sun *= max(0.0, pow(dot(rd, light), 128.0));
	col *= max(0.0, dot(light, vec3(0.0, 0.0, -1.0)));
	return clamp(sun + col * 0.01, 0.0, 1.0);
}

// ������� �������� �� �����������
vec2 mapTexture(vec3 p, vec3 n, vec3 pos, int mode) {
	vec3 point = (p - pos);
    vec2 result = vec2(0);
    if (mode == 0) { // Plane
        result.x = mod(point.x, 1);
        result.y = mod(point.y, 1);
	}
    else if (mode == 1) { // Cylinder
        point = normalize(point);
        result.x = (1 + point.z) / 2;
        result.y = (1 + atan2(point.xy) / (3.1415926 / 2)) / 2;
	}
    else if (mode == 2) { // Sphere
		float phi = acos( -n.z );
		result.x = 1 - phi / 3.1415926;
		float theta = (acos(n.y / sin( phi ))) / ( 2 * 3.1415926);
		result.y = n.x > 0 ? theta : 1 - theta;
    }
	else if (mode == 3) { // Cube
		vec2 norm;
		if (abs(n.x) == 1.0) norm = point.yz;
		if (abs(n.y) == 1.0) norm = point.xz;
		if (abs(n.z) == 1.0) norm = point.xy;
        result.x = mod(norm.x, 1);
        result.y = mod(norm.y, 1);
	}
    return result;
}

// ������ � �������� ����������� ������, ������� � �������� ������������ �������� �������
mat3x3[40] Prism(int faces, float h, float ra, vec3 pos) {
	mat3x3[40] triangles;
	if (faces > 10) return triangles;
	float angle = 360 / faces * (3.1415926 / 180);
	for (int i = 0; i < faces; i++) {
		float x1 = pos.x + ra * cos(angle * i);
		float y1 = pos.y + ra * sin(angle * i);
		float x2 = pos.x + ra * cos(angle * (i + 1));
		float y2 = pos.y + ra * sin(angle * (i + 1));
		triangles[i] = mat3x3( vec3(pos.x, pos.y, pos.z + h), vec3(x1, y1, pos.z + h), vec3(x2, y2, pos.z + h) );
	}
	for (int i = 0; i < faces; i++) {
		float x1 = pos.x + ra * cos(angle * i);
		float y1 = pos.y + ra * sin(angle * i);
		float x2 = pos.x + ra * cos(angle * (i + 1));
		float y2 = pos.y + ra * sin(angle * (i + 1));
		triangles[i + faces * 3] = mat3x3( vec3(pos.x, pos.y, pos.z), vec3(x2, y2, pos.z), vec3(x1, y1, pos.z) );
	}
	for (int i = 0; i < faces * 2; i++) {
		if (i < faces) {
			triangles[i + faces] = mat3x3( triangles[i + faces * 2][1], triangles[i][2], triangles[i][1] ); 
		} else {
			triangles[i + faces] = mat3x3( triangles[i][1], triangles[i + faces * 2][2], triangles[i + faces * 2][1] ); 
		}
	}
	return triangles;
}

// �������� � �������� ����������� ������, ������� � �������� ������������ �������� �������
mat3x3[20] Pyramid(int faces, float h, float ra, vec3 pos) {
	mat3x3[20] triangles;
	if (faces > 10) return triangles;
	float angle = 360 / faces * (3.1415926 / 180);
	for (int i = 0; i < faces; i++) {
		float x1 = pos.x + ra * cos(angle * i);
		float y1 = pos.y + ra * sin(angle * i);
		float x2 = pos.x + ra * cos(angle * (i + 1));
		float y2 = pos.y + ra * sin(angle * (i + 1));
		triangles[i] = mat3x3( vec3(pos.x, pos.y, pos.z), vec3(x1, y1, pos.z), vec3(x2, y2, pos.z) );
	}
	for (int i = 0; i < faces; i++) {
		triangles[i + faces] = mat3x3( triangles[i][1], triangles[i][2], vec3(pos.x, pos.y, pos.z + h) );
	}
	return triangles;
}

// ����������� ���� � ���������� ���������
float[9] colliderIntersection(vec3 ro, vec3 rd, int colliderId) {
	vec4 col;
	vec2 minIt = vec2(MAX_DIST);
	vec2 it;
	vec3 n;

	if (colliderId == 0) {
		vec4 sphere = vec4(41.5, 7.5, 0.0, 1.0);

		it = sphIntersect(ro - sphere.xyz, rd, sphere.w);
		if(it.x > 0.0 && it.x < minIt.x) {
			minIt = it;
			vec3 itPos = ro + rd * it.x;
			n = normalize(itPos - sphere.xyz);
			vec2 uv = mapTexture(itPos, n, vec3(0), 2);
			col = vec4(texture(u_texture, uv).rgb, 0.1);
		}


		mat2x4 spheres[4];
		spheres[0][0] = vec4(39.0, 8.0, -0.01, 1.0);
		spheres[1][0] = vec4(41.0, 1.0, -0.01, 1.0);
		spheres[2][0] = vec4(vec2(42.0, 5.0) + rotation(5, 15, 0), -4.0, 0.5);
		spheres[3][0] = vec4(vec2(42.0, 5.0) + rotation(5, 15, 7.5), -4.0, 0.5);

		spheres[0][1] = vec4(1.0, 1.0, 1.0, -0.5);
		spheres[1][1] = vec4(1.0, 0.0, 0.3, 1.0);
		spheres[2][1] = vec4(1.0, 1.0, 1.0, -2.0);
		spheres[3][1] = vec4(1.0, 1.0, 1.0, -2.0);

		for(int i = 0; i < spheres.length(); i++) {
			it = sphIntersect(ro - spheres[i][0].xyz, rd, spheres[i][0].w);
			if(it.x > 0.0 && it.x < minIt.x) {
				minIt = it;
				vec3 itPos = ro + rd * it.x;
				n = normalize(itPos - spheres[i][0].xyz);
				col = spheres[i][1];
			}
		}

		vec3 boxN;

		mat2x4 boxes[4];
		boxes[0][0] = vec4(45.0, 6.0, -0.001, 1.0);
		boxes[1][0] = vec4(47.0, 2.0, -0.001, 1.0);
		boxes[2][0] = vec4(47.0, 0.0 + linearMotion(8.0, 10.0, 0.0), -3.001 + linearMotion(2.0, 5.0, 0.0), 1.0);
		boxes[3][0] = vec4(47.0, 4.0 - linearMotion(8.0, 10.0, 0.0), -5.001 + linearMotion(2.0, 5.0, 0.0), 1.0);

		boxes[0][1] = vec4(0.9, 0.2, 0.2, -0.5);
		boxes[1][1] = vec4(1.0, 0.1, 0.1, 0.1);
		boxes[2][1] = vec4(0.1, 1.0, 0.1, 0.1);
		boxes[3][1] = vec4(0.1, 0.1, 1.0, 0.1);

		for(int i = 0; i < boxes.length(); i++) {
			it = boxIntersection(ro - boxes[i][0].xyz, rd, vec3(boxes[i][0].w), boxN);
			if(it.x > 0.0 && it.x < minIt.x) {
				minIt = it;
				n = boxN;
				if (i == 0) col = boxes[i][1];
				else {
					vec3 itPos = ro + rd * it.x;
					vec2 uv = mapTexture(itPos, n, boxes[i][0].xyz, 3);
					if (i == 1) col = vec4(texture(u_marble_texture, uv).rgb, boxes[i][1].w);
					if (i == 2) col = vec4(texture(u_brick_texture, uv).rgb, boxes[i][1].w);
					if (i == 3) col = vec4(texture(u_wood_texture, uv).rgb, boxes[i][1].w);
				}
			}
		}

		mat2x3 Cylinder;
		Cylinder[0] = vec3(vec2(38.5, 2.5) + rotation(1.0, 7.0, 0.0), 0.5);
		Cylinder[1] = vec3(vec2(38.5, 2.5) - rotation(1.0, 7.0, 0.0), 0.5);
		float cylRad = 0.5;

		it = vec2(cylIntersection(ro, rd, Cylinder[0], Cylinder[1], cylRad));
		if(it.x > 0.0 && it.x < minIt.x) {
			minIt = it;
			vec3 itPos = ro + rd * it.x;
			n = normalize(itPos - vec3(cylIntersection(ro, rd, Cylinder[0], Cylinder[1], cylRad)));
			col = vec4(1.0, 0.3, 0.0, 0.1);
		}
	}

	if (colliderId == 1) {
		// ������ ������ ��-�� ����������� ��������� ��������
		//TODO ����������� ���������� ����� ������ �� .gltf/.fbx...
	}

	if (colliderId == 2) {
		mat3x3 Triangles[28];

		Triangles[0] = mat3x3( vec3(39.5, 4.5, -0.5), vec3(40.5, 4.5, -0.5), vec3(40.0, 5.0, -1.0) );
		Triangles[1] = mat3x3( vec3(40.5, 4.5, -0.5), vec3(40.5, 5.5, -0.5), vec3(40.0, 5.0, -1.0) );
		Triangles[2] = mat3x3( vec3(39.5, 5.5, -0.5), vec3(39.5, 4.5, -0.5), vec3(40.0, 5.0, -1.0) );
		Triangles[3] = mat3x3( vec3(40.5, 5.5, -0.5), vec3(39.5, 5.5, -0.5), vec3(40.0, 5.0, -1.0) );

		Triangles[8] = mat3x3( vec3(40.0, 6.0, 0.0), vec3(39.5, 5.5, 0.5), vec3(39.5, 5.5, -0.5) );
		Triangles[9] = mat3x3( vec3(40.5, 5.5, -0.5), vec3(40.0, 6.0, 0.0), vec3(39.5, 5.5, -0.5) );
		Triangles[10] = mat3x3( vec3(40.5, 5.5, -0.5), vec3(40.5, 5.5, 0.5), vec3(40.0, 6.0, 0.0) );
		Triangles[11] = mat3x3( vec3(40.5, 5.5, 0.5), vec3(39.5, 5.5, 0.5), vec3(40.0, 6.0, 0.0) );

		Triangles[12] = mat3x3( vec3(39.5, 4.5, 0.5), vec3(40.5, 4.5, 0.5), vec3(40.0, 4.0, 0.0) );
		Triangles[13] = mat3x3( vec3(39.5, 4.5, -0.5), vec3(40.0, 4.0, 0.0), vec3(40.5, 4.5, -0.5) );
		Triangles[14] = mat3x3( vec3(40.0, 4.0, 0.0), vec3(40.5, 4.5, 0.5), vec3(40.5, 4.5, -0.5) );
		Triangles[15] = mat3x3( vec3(39.5, 4.5, -0.5), vec3(39.5, 4.5, 0.5), vec3(40.0, 4.0, 0.0) );

		Triangles[16] = mat3x3( vec3(39.5, 5.5, -0.5), vec3(39.5, 5.5, 0.5), vec3(39.0, 5.0, 0.0) );
		Triangles[17] = mat3x3( vec3(39.5, 5.5, -0.5), vec3(39.0, 5.0, 0.0), vec3(39.5, 4.5, -0.5) );
		Triangles[18] = mat3x3( vec3(39.0, 5.0, 0.0), vec3(39.5, 4.5, 0.5), vec3(39.5, 4.5, -0.5) );
		Triangles[19] = mat3x3( vec3(39.5, 5.5, 0.5), vec3(39.5, 4.5, 0.5), vec3(39.0, 5.0, 0.0) );

		Triangles[20] = mat3x3( vec3(41.0, 5.0, 0.0), vec3(40.5, 5.5, 0.5), vec3(40.5, 5.5, -0.5) );
		Triangles[21] = mat3x3( vec3(40.5, 4.5, -0.5), vec3(41.0, 5.0, 0.0), vec3(40.5, 5.5, -0.5) );
		Triangles[22] = mat3x3( vec3(40.5, 4.5, -0.5), vec3(40.5, 4.5, 0.5), vec3(41.0, 5.0, 0.0) );
		Triangles[23] = mat3x3( vec3(41.0, 5.0, 0.0), vec3(40.5, 4.5, 0.5), vec3(40.5, 5.5, 0.5) );

		Triangles[24] = mat3x3( vec3(39.5, 4.5, 0.5), vec3(40.5, 4.5, 0.5), vec3(40.0, 5.0, 1.0) );
		Triangles[25] = mat3x3( vec3(40.5, 4.5, 0.5), vec3(40.5, 5.5, 0.5), vec3(40.0, 5.0, 1.0) );
		Triangles[26] = mat3x3( vec3(39.5, 5.5, 0.5), vec3(39.5, 4.5, 0.5), vec3(40.0, 5.0, 1.0) );
		Triangles[27] = mat3x3( vec3(40.5, 5.5, 0.5), vec3(39.5, 5.5, 0.5), vec3(40.0, 5.0, 1.0) );

		for (int i = 0; i < Triangles.length(); i++) {
			it = vec2(triIntersection(ro, rd, Triangles[i][0], Triangles[i][1], Triangles[i][2]));
			if(it.x > 0.0 && it.x < minIt.x) {
				minIt = it;
				vec3 v0 = Triangles[i][0] - Triangles[i][1];
				vec3 v1 = Triangles[i][2] - Triangles[i][1];
				n = normalize(cross(v0, v1));
				col = vec4(0.0, 0.3, 1.0, 1.0);
			}
		}
	}

	if (colliderId == 3) {
		float faces = 3.0 + round(linearMotion(6.0, 20.0, 0.0));
		vec3 pos = vec3(43.5, 3.0, 1.5);
		float h = -2.5;
		float ra = 2.0;
		float angle = 360 / faces * (3.1415926 / 180);

		for (int i = 0; i < faces * 2; i++) {
			mat3x3 triangle;
			if (i < faces) {
				float x1 = pos.x + ra * cos(angle * i);
				float y1 = pos.y + ra * sin(angle * i);
				float x2 = pos.x + ra * cos(angle * (i + 1));
				float y2 = pos.y + ra * sin(angle * (i + 1));
				triangle = mat3x3( vec3(pos.x, pos.y, pos.z), vec3(x1, y1, pos.z), vec3(x2, y2, pos.z) );
			}
			else {
				float x1 = pos.x + ra * cos(angle * (i - faces));
				float y1 = pos.y + ra * sin(angle * (i - faces));
				float x2 = pos.x + ra * cos(angle * (i - faces + 1));
				float y2 = pos.y + ra * sin(angle * (i - faces + 1));
				triangle = mat3x3( vec3(x1, y1, pos.z), vec3(x2, y2, pos.z), vec3(pos.x, pos.y, pos.z + h) );
			}
			it = vec2(triIntersection(ro, rd, triangle[0], triangle[1], triangle[2]));
			if(it.x > 0.0 && it.x < minIt.x) {
				minIt = it;
				vec3 v0 = triangle[0] - triangle[1];
				vec3 v1 = triangle[2] - triangle[1];
				n = normalize(cross(v0, v1));
				col = vec4(linearMotion(1.0, 10.0, 0.0), linearMotion(1.0, 10.0, 5.0), linearMotion(1.0, 10.0, 10.0), 0.5);
			}
		}
	}

	if (colliderId == 4) {
		int faces = 6;
		vec3 pos = vec3(44.0, 9.5, 1.3);
		float h = -3.0;
		float ra = 1.0;
		float angle = 360 / faces * (3.1415926 / 180);

		for (int i = 0; i < faces * 4; i++) {
			mat3x3 triangle;
			if (i < faces) {
				float x1 = pos.x + ra * cos(angle * i);
				float y1 = pos.y + ra * sin(angle * i);
				float x2 = pos.x + ra * cos(angle * (i + 1));
				float y2 = pos.y + ra * sin(angle * (i + 1));
				triangle = mat3x3( vec3(pos.x, pos.y, pos.z + h), vec3(x1, y1, pos.z + h), vec3(x2, y2, pos.z + h) );
			}
			else if (i < faces * 3) {
				float x1u = pos.x + ra * cos(angle * i);
				float y1u = pos.y + ra * sin(angle * i);
				float x2u = pos.x + ra * cos(angle * (i + 1));
				float y2u = pos.y + ra * sin(angle * (i + 1));

				float x1b = pos.x + ra * cos(angle * (i + faces * 3));
				float y1b = pos.y + ra * sin(angle * (i + faces * 3));
				float x2b = pos.x + ra * cos(angle * (i + 1 + faces * 3));
				float y2b = pos.y + ra * sin(angle * (i + 1 + faces * 3));

				if (i < faces * 2) {
					triangle = mat3x3( vec3(x2b, y2b, pos.z), vec3(x2u, y2u, pos.z + h), vec3(x1u, y1u, pos.z + h) ); 
				} else {
					triangle = mat3x3( vec3(x1u, y1u, pos.z + h), vec3(x1b, y1b, pos.z), vec3(x2b, y2b, pos.z) ); 
				}
			}
			else {
				float x1 = pos.x + ra * cos(angle * (i + faces * 3));
				float y1 = pos.y + ra * sin(angle * (i + faces * 3));
				float x2 = pos.x + ra * cos(angle * (i + 1 + faces * 3));
				float y2 = pos.y + ra * sin(angle * (i + 1 + faces * 3));
				triangle = mat3x3( vec3(pos.x, pos.y, pos.z), vec3(x2, y2, pos.z), vec3(x1, y1, pos.z) );
			}
			it = vec2(triIntersection(ro, rd, triangle[0], triangle[1], triangle[2]));
			if(it.x > 0.0 && it.x < minIt.x) {
				minIt = it;
				vec3 v0 = triangle[0] - triangle[1];
				vec3 v1 = triangle[2] - triangle[1];
				n = normalize(cross(v0, v1));
				col = vec4(0.3, 1.0, 0.0, 1.0);
			}
		}
	}

	float result[9];

	result[0] = col.x;
	result[1] = col.y;
	result[2] = col.z;
	result[3] = col.w;

	result[4] = minIt.x;
	result[5] = minIt.y;

	result[6] = n.x;
	result[7] = n.y;
	result[8] = n.z;

	return result;
}

// ������������� ����, ���������� ���� ��� ����
vec4 castRay(inout vec3 ro, inout vec3 rd) {
	vec4 col;
	vec2 minIt = vec2(MAX_DIST);
	vec2 it;
	vec3 n;

	vec4 colliders[5];
	colliders[0] = vec4(42.0, 5.0, 0.0, 11.0); // Simple geometric bodies
	colliders[1] = vec4(-2.0, 0.0, 0.0, 11.0); // 3D model
	colliders[2] = vec4(40.0, 5.0, 0.0, 1.0); // Dodecahedron
	colliders[3] = vec4(43.5, 3.0, 0.6, 1.8); // Tetrahedron
	colliders[4] = vec4(44.0, 9.5, 0.0, 2.0); // Prism

	for(int i = 0; i < colliders.length(); i++) {
		if (has_sphIntersection(ro, rd, colliders[i])) {
			float data[9] = colliderIntersection(ro, rd, i);
			it = vec2(data[4], data[5]);
			if(it.x > 0.0 && it.x < minIt.x) {
				minIt = it;
				n = vec3(data[6], data[7], data[8]);
				col = vec4(data[0], data[1], data[2], data[3]);
			}
		}
	}

	vec3 planeNormal = vec3(0.0, 0.0, -1.0);
	it = vec2(plaIntersect(ro, rd, vec4(planeNormal, 1.0)));
	if(it.x > 0.0 && it.x < minIt.x) {
		minIt = it;
		n = planeNormal;
		col = vec4(0.5, 0.25, 0.1, 0.05);
	}

	if(minIt.x == MAX_DIST) return vec4(getSky(rd), -2.0);
	if(col.a == -2.0) return col;
	vec3 reflected = reflect(rd, n);
	if(col.a < 0.0) {
		float fresnel = 1.0 - abs(dot(-rd, n));
		if(random() - 0.1 < fresnel * fresnel) {
			rd = reflected;
			return col;
		}
		ro += rd * (minIt.y + 0.001);
		rd = refract(rd, n, 1.0 / (1.0 - col.a));
		return col;
	}
	vec3 itPos = ro + rd * it.x;
	vec3 r = randomOnSphere();
	vec3 diffuse = normalize(r * dot(r, n));
	ro += rd * (minIt.x - 0.001);
	rd = mix(diffuse, reflected, col.a);
	return col;
}

// ����������� ���� � ���������� ����, �����������
vec3 traceRay(vec3 ro, vec3 rd) {
	vec3 col = vec3(1.0);
	for (int i = 0; i < MAX_REF; i++)
	{
		vec4 refCol = castRay(ro, rd);
		col *= refCol.rgb;
		if(refCol.a == -2.0) return col;
	}
	return vec3(0.0);
}

// �������� ������ �������, ��������� �����, ������������ �����, ����������� ����� ����. �������
void main() {
	vec2 uv = (gl_TexCoord[0].xy - 0.5) * u_resolution / u_resolution.y;
	vec2 uvRes = hash22(uv + 1.0) * u_resolution + u_resolution;
	R_STATE.x = uint(u_seed1.x + uvRes.x);
	R_STATE.y = uint(u_seed1.y + uvRes.x);
	R_STATE.z = uint(u_seed2.x + uvRes.y);
	R_STATE.w = uint(u_seed2.y + uvRes.y);
	vec3 rayOrigin = u_pos;
	vec3 rayDirection = normalize(vec3(1.0, uv));
	rayDirection.zx *= rot(-u_mouse.y);
	rayDirection.xy *= rot(u_mouse.x);
	vec3 col = vec3(0.0);
	int samples = u_samples;
	for(int i = 0; i < samples; i++) {
		col += traceRay(rayOrigin, rayDirection);
	}
	col /= samples;

	float white = WHITE_BRIGHTNESS;
	col *= white * 16.0;
	col = (col * (1.0 + col / white / white)) / (1.0 + col);
	gl_FragColor = vec4(col, 1.0);
}